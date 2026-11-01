import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { verifyCatalogHistory } from "../scripts/lib/catalog-history.mjs";
import {
  authorizeCandidateRequest,
  createCandidate,
  inspectWorkflow,
  itemDigest,
  prepareFinalReview,
  promoteAssets,
  quarantineCandidate,
  recordFinalBatchApproval,
  sha256File,
  updateWorkflowAfterQa
} from "../scripts/lib/asset-pipeline.mjs";

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function fixture() {
  const root = await mkdtemp(resolve(tmpdir(), "mockup-asset-pipeline-"));
  await mkdir(resolve(root, "quality"), { recursive: true });
  await cp(resolve(sourceRoot, "quality/asset-pipeline-policy.json"), resolve(root, "quality/asset-pipeline-policy.json"));
  const common = {
    schemaVersion: 5,
    publishedAt: "2026-10-30T00:00:00.000Z",
    rendererVersion: "2.4.0",
    minimumPluginVersion: "0.1.0",
    categories: [
      { id: "display", label: "显示器" },
      { id: "phone", label: "手机" },
      { id: "laptop", label: "笔记本" }
    ],
    items: []
  };
  await writeJson(resolve(root, "catalog/testing/v1/manifest.json"), { ...common, environment: "testing", catalogVersion: "2026.10.30.1" });
  await writeJson(resolve(root, "catalog/production/v1/manifest.json"), { ...common, environment: "production", catalogVersion: "2026.10.30.2" });
  await writeJson(resolve(root, "catalog/workflow/state.json"), {
    schemaVersion: 2,
    policyId: "MOCKUP-ASSET-PIPELINE-1",
    updatedAt: "1970-01-01T00:00:00.000Z",
    requests: {},
    assets: {}
  });
  await mkdir(resolve(root, "plugin"), { recursive: true });
  await writeFile(resolve(root, "plugin/ui.html"), '<script>const BUILD_FINGERPRINT = "DEV-ABCDEF123456";</script>\n');
  await writeJson(resolve(root, "docs/evidence/asset-pipeline/real-host-DEV-ABCDEF123456.json"), {
    schemaVersion: 1,
    evidenceType: "real-figma-host-regression",
    status: "passed",
    buildFingerprint: "DEV-ABCDEF123456",
    host: { application: "Figma+EX", document: "Fixture", plugin: "Mockup Studio" },
    results: Object.fromEntries([
      "pluginOpened",
      "selectedFigmaImageImported",
      "hoverStable",
      "rightEdgeHorizontalOnly",
      "bottomEdgeVerticalOnly",
      "noCornerOrApertureLeak",
      "resetRestoresDefault"
    ].map((key) => [key, { passed: true }]))
  });
  const referencePath = resolve(root, "input/reference.png");
  const basePath = resolve(root, "input/candidate.png");
  await mkdir(dirname(referencePath), { recursive: true });
  await sharp({ create: { width: 240, height: 180, channels: 4, background: { r: 180, g: 40, b: 60, alpha: 1 } } }).png().toFile(referencePath);
  await sharp({ create: { width: 320, height: 240, channels: 4, background: { r: 20, g: 80, b: 140, alpha: 1 } } }).png().toFile(basePath);
  return { root, referencePath, basePath };
}

async function authorize(fixture, overrides = {}) {
  return authorizeCandidateRequest(fixture.root, {
    referencePath: fixture.referencePath,
    name: "流水线手机 · 正面",
    category: "phone",
    rightsMode: "reference-only",
    assetId: "pipeline-phone-front",
    requestText: "请根据这张截图制作一个样机候选。",
    actor: "Wang Zhentao",
    confirmedByHuman: true,
    recordedBy: "Test Agent",
    ...overrides
  });
}

function input(fixture, requestId, overrides = {}) {
  return {
    requestId,
    basePath: fixture.basePath,
    tags: ["phone", "front"],
    screenQuad: [[60, 30], [260, 30], [260, 210], [60, 210]],
    apertureQuad: [[60, 30], [260, 30], [260, 210], [60, 210]],
    cornerRadii: [0.08, 0.08, 0.08, 0.08],
    recommendedSize: { width: 1170, height: 2532, label: "手机竖屏" },
    defaultFit: "cover",
    generationNote: "测试夹具生成的项目自制候选",
    actor: "Test Agent",
    ...overrides
  };
}

async function manifest(root, library) {
  return JSON.parse(await readFile(resolve(root, `catalog/${library}/v1/manifest.json`), "utf8"));
}

async function qaPass(root, item, overrides = {}) {
  const report = {
    schemaVersion: 3,
    assetId: item.id,
    revision: item.revision,
    status: "approved",
    rendererVersion: "2.4.0",
    itemSha256: itemDigest(item),
    approvedAt: "2026-10-31T05:00:00.000Z",
    patternIds: ["grid", "landscape", "portrait", "edge"],
    automaticChecks: Object.fromEntries(["schema", "renderer", "dimensions", "recommendedSize", "geometry", "aperture", "completeBase", "noChroma", "provenance", "integrity"].map((key) => [key, true])),
    apertureMetrics: { pass: true, mode: "aperture-mask", source: "explicit-geometry", exact: true, apertureArea: 36000, canvasArea: 76800 },
    completeBaseMetrics: { pass: true, mode: "aperture-mask", detector: "complete-screen-provenance-v2", sampledPixels: 9000, greenDominantPixels: 0, greenDominantRatio: 0, maximumGreenRatio: 0.85, presentationPass: true },
    manualChecks: Object.fromEntries(["frameFit", "perspective", "edgeMask", "imageQuality", "allPatterns"].map((key) => [key, true]))
    , ...overrides
  };
  const path = resolve(root, `catalog/testing/v1/approvals/${item.id}-r${item.revision}.json`);
  await writeJson(path, report);
  await updateWorkflowAfterQa(root, item, report, path);
  return { report, path };
}

test("candidate import is atomic, classified, revisioned and fingerprinted", async () => {
  const f = await fixture();
  try {
    const beforeManifest = await readFile(resolve(f.root, "catalog/testing/v1/manifest.json"), "utf8");
    const beforeState = await readFile(resolve(f.root, "catalog/workflow/state.json"), "utf8");
    await assert.rejects(createCandidate(f.root, input(f, "missing-request")), /找不到已授权/);
    await assert.rejects(authorize(f, { rightsMode: "" }), /权利模式/);
    await assert.rejects(authorize(f, { category: "tablet" }), /受控 taxonomy/);
    await assert.rejects(authorize(f, { assetId: "Pipeline Phone" }), /kebab-case/);
    await assert.rejects(authorize(f, { confirmedByHuman: false }), /明确的人类请求/);
    assert.equal(await readFile(resolve(f.root, "catalog/testing/v1/manifest.json"), "utf8"), beforeManifest);
    assert.equal(await readFile(resolve(f.root, "catalog/workflow/state.json"), "utf8"), beforeState);

    const authorized = await authorize(f);
    const requestId = authorized.request.requestId;
    const afterAuthorizationState = await readFile(resolve(f.root, "catalog/workflow/state.json"), "utf8");
    const durableReferencePath = resolve(f.root, authorized.request.reference.path);
    const durableReferenceBytes = await readFile(durableReferencePath);
    await writeFile(durableReferencePath, "tampered reference bytes");
    await assert.rejects(createCandidate(f.root, input(f, requestId)), /委托参考图摘要已漂移/);
    await writeFile(durableReferencePath, durableReferenceBytes);
    await assert.rejects(createCandidate(f.root, input(f, requestId, { basePath: f.referencePath })), /不能直接作为候选素材/);
    const damagedPath = resolve(f.root, "input/damaged.png");
    await writeFile(damagedPath, "not an image");
    await assert.rejects(createCandidate(f.root, input(f, requestId, { basePath: damagedPath })), /unsupported image format|Input buffer|corrupt|image/i);
    assert.equal(await readFile(resolve(f.root, "catalog/testing/v1/manifest.json"), "utf8"), beforeManifest);
    assert.equal(await readFile(resolve(f.root, "catalog/workflow/state.json"), "utf8"), afterAuthorizationState);

    const conflictPath = resolve(f.root, "catalog/testing/v1/assets/pipeline-phone-front-r1.png");
    await mkdir(dirname(conflictPath), { recursive: true });
    await writeFile(conflictPath, "conflicting immutable bytes");
    await assert.rejects(createCandidate(f.root, input(f, requestId)), /不可变文件已存在但内容不同/);
    assert.equal(await readFile(resolve(f.root, "catalog/testing/v1/manifest.json"), "utf8"), beforeManifest);
    assert.equal(await readFile(resolve(f.root, "catalog/workflow/state.json"), "utf8"), afterAuthorizationState);
    assert.equal(await readFile(conflictPath, "utf8"), "conflicting immutable bytes");
    await rm(conflictPath);

    const first = await createCandidate(f.root, input(f, requestId));
    assert.equal(first.item.id, "pipeline-phone-front");
    assert.equal(first.item.revision, 1);
    assert.deepEqual(first.item.canvas, { width: 320, height: 240 });
    assert.equal(first.item.provenance.pipelinePolicyId, "MOCKUP-ASSET-PIPELINE-1");
    assert.equal(first.item.provenance.candidateRequestId, requestId);
    assert.equal(first.workflow.state, "TESTING");
    assert.equal((await inspectWorkflow(f.root)).workflowState, "TESTING");
    assert.equal(await sha256File(resolve(f.root, "catalog/testing/v1", first.item.layers.base)), first.item.integrity.baseSha256);
    assert.equal(await sha256File(resolve(f.root, "catalog/testing/v1", first.item.thumbnail)), first.item.integrity.thumbnailSha256);

    await assert.rejects(createCandidate(f.root, input(f, requestId)), /已消耗或不可用/);
    await assert.rejects(authorize(f), /再次使用必须获得/);
    await sharp({ create: { width: 320, height: 240, channels: 4, background: { r: 30, g: 120, b: 190, alpha: 1 } } }).png().toFile(f.basePath);
    const secondAuthorization = await authorize(f, { referenceReuseAuthorized: true });
    const second = await createCandidate(f.root, input(f, secondAuthorization.request.requestId));
    assert.equal(second.item.revision, 2);
    assert.equal((await manifest(f.root, "testing")).items.find((item) => item.id === first.item.id).revision, 2);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("technical QA runs first and one human final batch decision gates atomic promotion", async () => {
  const f = await fixture();
  try {
    const request = await authorize(f);
    const candidate = await createCandidate(f.root, input(f, request.request.requestId));
    const item = candidate.item;
    const { path: qaPath } = await qaPass(f.root, item);
    const qaReportSha256 = await sha256File(qaPath);
    const review = await prepareFinalReview(f.root, { assetIds: [item.id] });
    assert.equal(review.packet.items.length, 1);
    assert.equal(review.packet.items[0].qaReportSha256, qaReportSha256);
    assert.equal(review.packet.hostEvidencePath, "docs/evidence/asset-pipeline/real-host-DEV-ABCDEF123456.json");
    assert.match(review.packet.hostEvidenceSha256, /^[a-f0-9]{64}$/);
    const hostEvidencePath = resolve(f.root, review.packet.hostEvidencePath);
    const hostEvidenceBytes = await readFile(hostEvidencePath);
    const invalidHostEvidence = JSON.parse(hostEvidenceBytes);
    invalidHostEvidence.results.hoverStable.passed = false;
    await writeJson(hostEvidencePath, invalidHostEvidence);
    await assert.rejects(prepareFinalReview(f.root, { assetIds: [item.id] }), /hoverStable/);
    await writeFile(hostEvidencePath, hostEvidenceBytes);
    await assert.rejects(recordFinalBatchApproval(f.root, {
      assetIds: [item.id], actor: "Wang Zhentao", expectedBatchFingerprint: review.packet.batchFingerprint, confirmedByHuman: false
    }), /明确的人类确认/);
    await assert.rejects(recordFinalBatchApproval(f.root, {
      assetIds: [item.id], actor: "Wang Zhentao", expectedBatchFingerprint: `sha256:${"f".repeat(64)}`, confirmedByHuman: true
    }), /批次指纹/);
    const release = await recordFinalBatchApproval(f.root, {
      assetIds: [item.id], actor: "Wang Zhentao", expectedBatchFingerprint: review.packet.batchFingerprint, confirmedByHuman: true
    });
    assert.equal(release.workflowState, "FINAL_APPROVED");
    assert.equal(release.approvals.length, 1);

    const productionBefore = await readFile(resolve(f.root, "catalog/production/v1/manifest.json"), "utf8");
    const conflictPath = resolve(f.root, "catalog/production/v1", item.layers.base);
    await mkdir(dirname(conflictPath), { recursive: true });
    await writeFile(conflictPath, "conflicting bytes");
    await assert.rejects(promoteAssets(f.root, { assetId: item.id }), /不可变路径已存在不同字节/);
    assert.equal(await readFile(resolve(f.root, "catalog/production/v1/manifest.json"), "utf8"), productionBefore);
    await rm(conflictPath);

    const testing = await manifest(f.root, "testing");
    testing.items[0].name = "被篡改的名称";
    await writeJson(resolve(f.root, "catalog/testing/v1/manifest.json"), testing);
    await assert.rejects(promoteAssets(f.root, { assetId: item.id }), /技术 QA 报告已过期或无效/);
    assert.equal(await readFile(resolve(f.root, "catalog/production/v1/manifest.json"), "utf8"), productionBefore);
    testing.items[0] = item;
    await writeJson(resolve(f.root, "catalog/testing/v1/manifest.json"), testing);

    const result = await promoteAssets(f.root, { assetId: item.id });
    assert.equal(result.promoted.length, 1);
    const production = await manifest(f.root, "production");
    const published = production.items[0];
    assert.equal(published.status, "approved");
    assert.equal(published.qa.sourceItemSha256, itemDigest(item));
    assert.equal(published.qa.reportSha256, qaReportSha256);
    assert.equal(published.release.actor.identity, "Wang Zhentao");
    assert.equal(published.release.qaReportSha256, qaReportSha256);
    const status = await inspectWorkflow(f.root);
    assert.equal(status.assets[0].state, "PROMOTED");
    assert.match(status.assets[0].nextAction, /独立远程目录合同/);
    assert.equal((await verifyCatalogHistory(f.root, "production")).version, result.catalogVersion);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("自然绿色歧义不增加前置批准，只在唯一最终批次决定中确认", async () => {
  const f = await fixture();
  try {
    await sharp({ create: { width: 320, height: 240, channels: 4, background: "#00ff00" } }).png().toFile(f.basePath);
    const request = await authorize(f, { assetId: "natural-green-display", category: "display", name: "自然绿色显示器" });
    const candidate = await createCandidate(f.root, input(f, request.request.requestId, { screenPresentationMode: "reference-bound" }));
    assert.equal(candidate.item.provenance.completenessHeuristic.result, "human-review-required");
    assert.equal(candidate.workflow.state, "TESTING");
    assert.equal(Object.hasOwn(candidate.workflow, "visualApproval"), false);
    await qaPass(f.root, candidate.item, {
      completeBaseMetrics: { pass: false, technicalPass: true, mode: "aperture-mask", detector: "complete-screen-provenance-v2", sampledPixels: 9000, greenDominantPixels: 9000, greenDominantRatio: 1, maximumGreenRatio: 0.85, presentationPass: true, resolution: "final-batch-decision-required" }
    });
    const review = await prepareFinalReview(f.root, { assetIds: [candidate.item.id] });
    const decision = await recordFinalBatchApproval(f.root, {
      assetIds: [candidate.item.id],
      actor: "Wang Zhentao",
      expectedBatchFingerprint: review.packet.batchFingerprint,
      confirmedByHuman: true
    });
    assert.equal(decision.workflowState, "FINAL_APPROVED");
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("最终批次不通过是同一个且唯一的人类决定，不会生成逐项批准", async () => {
  const f = await fixture();
  try {
    const request = await authorize(f);
    const candidate = await createCandidate(f.root, input(f, request.request.requestId));
    await qaPass(f.root, candidate.item);
    const review = await prepareFinalReview(f.root, { assetIds: [candidate.item.id] });
    const decision = await recordFinalBatchApproval(f.root, {
      assetIds: [candidate.item.id],
      actor: "Wang Zhentao",
      decision: "reject",
      expectedBatchFingerprint: review.packet.batchFingerprint,
      confirmedByHuman: true
    });
    assert.equal(decision.batch.decision, "reject");
    assert.equal(decision.workflowState, "NEEDS_REVISION");
    assert.equal((await inspectWorkflow(f.root)).assets[0].state, "NEEDS_REVISION");
    await assert.rejects(readFile(resolve(f.root, `catalog/testing/v1/release-approvals/${candidate.item.id}-r${candidate.item.revision}.json`)), /ENOENT/);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("未经用户委托的候选可保留审计证据并从活动路径隔离", async () => {
  const f = await fixture();
  try {
    const request = await authorize(f);
    const candidate = await createCandidate(f.root, input(f, request.request.requestId));
    const result = await quarantineCandidate(f.root, {
      assetId: candidate.item.id,
      reason: "纠正检查确认候选缺少当次有效的用户委托",
      actor: "Codex workflow correction"
    });
    assert.equal(result.state, "REJECTED");
    assert.equal((await manifest(f.root, "testing")).items.length, 0);
    await assert.rejects(readFile(resolve(f.root, "catalog/testing/v1", candidate.item.layers.base)), /ENOENT/);
    assert.equal(await sha256File(resolve(f.root, result.quarantine.files[0].path)), candidate.item.integrity.baseSha256);
    const status = await inspectWorkflow(f.root);
    assert.equal(status.assets[0].state, "REJECTED");
    assert.equal(status.workflowState, "WAITING_FOR_USER_INPUT");
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
