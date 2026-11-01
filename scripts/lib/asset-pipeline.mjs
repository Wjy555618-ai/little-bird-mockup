import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, resolve, sep } from "node:path";
import sharp from "sharp";
import { atomicWriteJson, copyImmutableFile, snapshotCatalog, snapshotCatalogManifest } from "./catalog-history.mjs";
import { analyzeCompleteBase } from "./no-chroma.mjs";

export const POLICY_RELATIVE_PATH = "quality/asset-pipeline-policy.json";
export const STATE_RELATIVE_PATH = "catalog/workflow/state.json";
export const TESTING_MANIFEST_RELATIVE_PATH = "catalog/testing/v1/manifest.json";
export const PRODUCTION_MANIFEST_RELATIVE_PATH = "catalog/production/v1/manifest.json";

function fail(message) {
  throw new Error(message);
}

export function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function sha256File(path) {
  return sha256Bytes(await readFile(path));
}

export function itemDigest(item) {
  return sha256Bytes(Buffer.from(JSON.stringify(item)));
}

function safeRelativePath(root, relativePath, label) {
  if (typeof relativePath !== "string" || !relativePath || relativePath.startsWith("/") || relativePath.includes("\\") || relativePath.split("/").includes("..")) {
    fail(`${label} 路径无效`);
  }
  const path = resolve(root, relativePath);
  if (path !== root && !path.startsWith(`${root}${sep}`)) fail(`${label} 路径越界`);
  return path;
}

async function readJson(path, label) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) fail(`${label} 不是有效 JSON`);
    throw error;
  }
}

export async function loadPolicy(projectRoot) {
  return readJson(resolve(projectRoot, POLICY_RELATIVE_PATH), "样机流水线政策");
}

function emptyState(policy) {
  return {
    schemaVersion: 2,
    policyId: policy.policyId,
    updatedAt: new Date(0).toISOString(),
    requests: {},
    assets: {}
  };
}

export async function loadWorkflowState(projectRoot, policy = null) {
  const activePolicy = policy || await loadPolicy(projectRoot);
  const path = resolve(projectRoot, STATE_RELATIVE_PATH);
  const state = await readJson(path, "样机流水线状态").catch((error) => error?.code === "ENOENT" ? emptyState(activePolicy) : Promise.reject(error));
  if (state.schemaVersion !== 2 || state.policyId !== activePolicy.policyId || !state.requests || typeof state.requests !== "object" || Array.isArray(state.requests) || !state.assets || typeof state.assets !== "object" || Array.isArray(state.assets)) {
    fail("样机流水线状态与当前政策不兼容");
  }
  return state;
}

export async function writeWorkflowState(projectRoot, state) {
  const nextState = structuredClone(state);
  nextState.updatedAt = new Date().toISOString();
  await atomicWriteJson(resolve(projectRoot, STATE_RELATIVE_PATH), nextState);
  return nextState;
}

export async function migrateWorkflowV4(projectRoot) {
  const policy = await loadPolicy(projectRoot);
  if (policy.policyRevision !== 4) fail("只有政策修订版 4 可以执行当前工作流迁移");
  const state = await loadWorkflowState(projectRoot, policy);
  const nextState = structuredClone(state);
  let changed = false;
  for (const entry of Object.values(nextState.assets)) {
    if (Object.hasOwn(entry, "visualApproval")) {
      delete entry.visualApproval;
      changed = true;
    }
    if (entry.state === "CANDIDATE_READY" || entry.state === "VISUAL_APPROVED") {
      transition(entry, "TESTING", "工作流修订版 4 删除人工前置视觉批准，候选直接进入技术质检", "system-migration-v4");
      changed = true;
    } else if (entry.state === "RELEASE_APPROVED") {
      entry.releaseApproval = null;
      transition(entry, "QA_PASSED", "工作流修订版 4 退役逐项入库批准，重新纳入唯一最终批次", "system-migration-v4");
      changed = true;
    } else {
      const nextAction = nextActionFor(entry.state);
      if (entry.nextAction !== nextAction) {
        entry.nextAction = nextAction;
        changed = true;
      }
    }
  }
  nextState.workflowRevision = 4;
  if (state.workflowRevision !== 4) changed = true;
  if (changed) await writeWorkflowState(projectRoot, nextState);
  return { changed, workflowRevision: 4, assets: Object.values(nextState.assets).map(({ assetId, revision, state }) => ({ assetId, revision, state })) };
}

function extensionForFormat(format) {
  return ({ jpeg: "jpg", png: "png", webp: "webp" })[format] || "";
}

function normalizeAsciiToken(value) {
  return String(value || "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function normalizeTags(values) {
  const output = [];
  for (const raw of values || []) {
    const value = String(raw || "").trim();
    if (value && !output.includes(value)) output.push(value);
  }
  return output.slice(0, 24);
}

function generatedAssetId(category, tags, baseSha256) {
  const semantic = tags.map(normalizeAsciiToken).filter(Boolean).slice(0, 2);
  return [category, ...(semantic.length ? semantic : [baseSha256.slice(0, 10)])].join("-");
}

function assertAssetId(policy, assetId) {
  if (!new RegExp(policy.identity.assetIdPattern).test(assetId || "")) fail("assetId 必须是小写 ASCII kebab-case");
}

function assertFinitePair(point, label) {
  if (!Array.isArray(point) || point.length !== 2 || point.some((value) => !Number.isFinite(value))) fail(`${label} 顶点无效`);
}

function assertQuad(quad, width, height, label) {
  if (!Array.isArray(quad) || quad.length !== 4) fail(`${label} 必须有四个顶点`);
  for (const point of quad) {
    assertFinitePair(point, label);
    if (point[0] < 0 || point[0] > width || point[1] < 0 || point[1] > height) fail(`${label} 顶点超出画布`);
  }
  const area = Math.abs(quad.reduce((sum, point, index) => {
    const next = quad[(index + 1) % quad.length];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0) / 2);
  if (area < width * height * 0.005) fail(`${label} 区域过小或顶点顺序错误`);
}

function roundedQuad(quad) {
  return quad.map(([x, y]) => [Math.round(x), Math.round(y)]);
}

function currentDateVersion(current, now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(now).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const prefix = `${parts.year}.${parts.month}.${parts.day}`;
  const currentNumber = String(current || "").startsWith(`${prefix}.`) ? Number(String(current).split(".").at(-1)) || 0 : 0;
  return `${prefix}.${currentNumber + 1}`;
}

function nextActionFor(state) {
  return ({
    REQUEST_AUTHORIZED: "只能为已绑定截图摘要的单个候选执行制作与导入",
    CANDIDATE_READY: "系统应立即转入技术质检，不得等待人工前置批准",
    TESTING: "在样机质检台完成十项自动检查、四种测试图和五项人工检查",
    QA_PASSED: "只接受由当前构建、当前真实 Figma 宿主证据和当前技术 QA 生成的唯一最终审阅批次；随后只请求一次人类决定",
    FINAL_APPROVED: "运行批次原子提升并核验正式库",
    PROMOTED: "本地资产闭环完成；线上阶段由独立远程目录合同决定",
    NEEDS_REVISION: "根据审核或质检问题制作新 revision",
    QA_FAILED: "修复失败项并生成新 revision",
    BLOCKED: "先解决 blockedReasons，禁止继续流转",
    REJECTED: "保持历史记录；只有新的单次用户创作委托才能继续"
  })[state] || "检查合同与状态";
}

function assertHumanCandidateRequest(options) {
  if (options.confirmedByHuman !== true || !options.actor?.trim()) fail("候选创作委托必须来自明确的人类请求并记录决定人身份");
  if (!options.requestText?.trim()) fail("候选创作委托必须保留可定位的人类请求摘要");
}

export async function authorizeCandidateRequest(projectRoot, input) {
  assertHumanCandidateRequest(input);
  const policy = await loadPolicy(projectRoot);
  const state = await loadWorkflowState(projectRoot, policy);
  if (!policy.rightsModes.includes(input.rightsMode)) fail(`权利模式必须是：${policy.rightsModes.join("、")}`);
  const category = policy.taxonomy.categories.find((item) => item.id === input.category);
  if (!category) fail(`分类不在受控 taxonomy：${input.category || "未提供"}`);
  if (!input.name?.trim()) fail("样机展示名称不能为空");
  const assetId = String(input.assetId || "");
  assertAssetId(policy, assetId);
  const referenceBytes = await existingFile(resolve(input.referencePath), "参考图", 33_554_432);
  const referenceSha256 = sha256Bytes(referenceBytes);
  const priorReferenceUse = Object.values(state.assets).some((entry) => entry.reference?.sha256 === referenceSha256)
    || Object.values(state.requests).some((request) => request.referenceSha256 === referenceSha256);
  if (priorReferenceUse && input.referenceReuseAuthorized !== true) fail("该参考图已经用于其他候选；再次使用必须获得当次明确的人类复用授权");
  const now = new Date().toISOString();
  const requestId = `request-${assetId}-${sha256Bytes(Buffer.from(JSON.stringify({
    assetId,
    referenceSha256,
    requestText: input.requestText.trim(),
    actor: input.actor.trim(),
    now
  }))).slice(0, 12)}`;
  const referenceExtension = normalizeAsciiToken(extname(input.referencePath).slice(1)) || "bin";
  const referenceRelativePath = `catalog/workflow/references/requests/${requestId}.${referenceExtension}`;
  const requestRelativePath = `catalog/workflow/candidate-requests/${requestId}.json`;
  const record = {
    schemaVersion: 1,
    requestType: "candidate-creation",
    requestId,
    operation: "create-one-candidate",
    assetId,
    name: input.name.trim(),
    category: category.id,
    reference: {
      path: referenceRelativePath,
      sha256: referenceSha256,
      rightsMode: input.rightsMode,
      reuseAuthorized: input.referenceReuseAuthorized === true
    },
    constraints: { maximumCandidates: 1 },
    requestText: input.requestText.trim(),
    actor: { type: "human", identity: input.actor.trim(), role: input.role || "产品与视觉决定人" },
    authorizedAt: now,
    attestation: { method: "local", confirmedByHuman: true },
    recordedBy: input.recordedBy || "AI/工程执行代理"
  };
  const requestBytes = Buffer.from(`${JSON.stringify(record, null, 2)}\n`);
  const requestSha256 = sha256Bytes(requestBytes);
  const nextState = structuredClone(state);
  nextState.requests[requestId] = {
    requestId,
    status: "AUTHORIZED",
    requestPath: requestRelativePath,
    requestSha256,
    referenceSha256,
    assetId,
    maximumCandidates: 1,
    consumedCount: 0,
    consumedBy: null
  };
  const created = [];
  try {
    const referencePath = resolve(projectRoot, referenceRelativePath);
    const requestPath = resolve(projectRoot, requestRelativePath);
    if (await writeImmutableBytes(referencePath, referenceBytes)) created.push(referencePath);
    if (await writeImmutableBytes(requestPath, requestBytes)) created.push(requestPath);
    await writeWorkflowState(projectRoot, nextState);
  } catch (error) {
    await Promise.all(created.map((path) => rm(path, { force: true }).catch(() => {})));
    await atomicWriteJson(resolve(projectRoot, STATE_RELATIVE_PATH), state).catch(() => {});
    throw error;
  }
  return { request: record, requestSha256, status: "AUTHORIZED", nextAction: nextActionFor("REQUEST_AUTHORIZED") };
}

async function currentCandidateRequest(projectRoot, state, requestId) {
  const summary = state.requests[requestId];
  if (!summary) fail("找不到已授权的候选创作委托");
  if (summary.status !== "AUTHORIZED" || summary.consumedCount !== 0 || summary.consumedBy) fail("候选创作委托已消耗或不可用，不得重复生成候选");
  const requestPath = safeRelativePath(projectRoot, summary.requestPath, "候选创作委托");
  const request = await readJson(requestPath, "候选创作委托");
  const requestSha256 = await sha256File(requestPath);
  if (requestSha256 !== summary.requestSha256 || request.requestId !== requestId || request.requestType !== "candidate-creation" || request.operation !== "create-one-candidate" || request.constraints?.maximumCandidates !== 1 || request.attestation?.confirmedByHuman !== true || request.actor?.type !== "human") fail("候选创作委托已漂移或绑定不完整");
  return { summary, request, requestSha256 };
}

function transition(entry, state, reason, actor = "system") {
  entry.history ||= [];
  entry.history.push({ state, reason, actor, at: new Date().toISOString() });
  entry.state = state;
  entry.nextAction = nextActionFor(state);
  entry.blockedReasons = state === "BLOCKED" ? entry.blockedReasons || [reason] : [];
}

async function writeImmutableBytes(path, bytes) {
  const existing = await readFile(path).catch((error) => error?.code === "ENOENT" ? null : Promise.reject(error));
  if (existing) {
    if (!existing.equals(bytes)) fail(`不可变文件已存在但内容不同：${path}`);
    return false;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes, { flag: "wx" });
  return true;
}

async function writeImmutableJson(path, value) {
  return writeImmutableBytes(path, Buffer.from(`${JSON.stringify(value, null, 2)}\n`));
}

async function existingFile(path, label, maxBytes) {
  const info = await stat(path).catch(() => null);
  if (!info?.isFile() || info.size < 1) fail(`${label} 不存在或为空`);
  if (info.size > maxBytes) fail(`${label} 超过允许的最大字节数`);
  return readFile(path);
}

function sameItemIdentity(item, assetId, revision) {
  return item?.id === assetId && item?.revision === revision;
}

export async function createCandidate(projectRoot, input) {
  const policy = await loadPolicy(projectRoot);
  const testingManifestPath = resolve(projectRoot, TESTING_MANIFEST_RELATIVE_PATH);
  const productionManifestPath = resolve(projectRoot, PRODUCTION_MANIFEST_RELATIVE_PATH);
  const [testing, production, state] = await Promise.all([
    readJson(testingManifestPath, "测试库清单"),
    readJson(productionManifestPath, "正式库清单"),
    loadWorkflowState(projectRoot, policy)
  ]);
  const { summary: requestSummary, request, requestSha256 } = await currentCandidateRequest(projectRoot, state, input.requestId);
  if (!policy.rightsModes.includes(request.reference?.rightsMode)) fail("候选创作委托的权利模式无效");
  const category = policy.taxonomy.categories.find((item) => item.id === request.category);
  if (!category) fail(`候选创作委托的分类不在受控 taxonomy：${request.category || "未提供"}`);
  assertAssetId(policy, request.assetId);
  const maxAssetBytes = 33_554_432;
  const requestReferencePath = safeRelativePath(projectRoot, request.reference.path, "委托参考图");
  const [referenceBytes, baseBytes] = await Promise.all([
    existingFile(requestReferencePath, "委托参考图", maxAssetBytes),
    existingFile(resolve(input.basePath), "候选基础图", maxAssetBytes)
  ]);
  const referenceSha256 = sha256Bytes(referenceBytes);
  const baseSha256 = sha256Bytes(baseBytes);
  if (referenceSha256 !== request.reference.sha256 || referenceSha256 !== requestSummary.referenceSha256) fail("委托参考图摘要已漂移");
  if (request.reference.rightsMode === "reference-only" && referenceSha256 === baseSha256) fail("reference-only 参考图不能直接作为候选素材");
  const metadata = await sharp(baseBytes, { failOn: "error" }).metadata();
  const baseExtension = extensionForFormat(metadata.format);
  if (!baseExtension || !Number.isInteger(metadata.width) || !Number.isInteger(metadata.height)) fail("候选基础图必须是可读取的 PNG、JPEG 或 WebP");
  const width = metadata.width;
  const height = metadata.height;
  const tags = normalizeTags(input.tags);
  const assetId = request.assetId;
  assertAssetId(policy, assetId);
  const existingRevisions = [...testing.items, ...production.items].filter((item) => item.id === assetId).map((item) => item.revision);
  const revision = Math.max(0, ...existingRevisions) + 1;
  const screenQuad = roundedQuad(input.screenQuad);
  const apertureQuad = roundedQuad(input.apertureQuad || input.screenQuad);
  assertQuad(screenQuad, width, height, "内容映射面");
  assertQuad(apertureQuad, width, height, "可见孔径");
  const cornerRadii = (input.cornerRadii || [0, 0, 0, 0]).map(Number);
  if (cornerRadii.length !== 4 || cornerRadii.some((value) => !Number.isFinite(value) || value < 0 || value > 0.49)) fail("可见孔径必须声明四个 0–0.49 的圆角比例");
  const recommendedWidth = Number(input.recommendedSize?.width);
  const recommendedHeight = Number(input.recommendedSize?.height);
  if (!Number.isInteger(recommendedWidth) || recommendedWidth < 1 || !Number.isInteger(recommendedHeight) || recommendedHeight < 1 || !input.recommendedSize?.label) fail("推荐画面尺寸无效");
  const screenPresentationMode = input.screenPresentationMode || "neutral-off";
  if (!["neutral-off", "reference-bound"].includes(screenPresentationMode)) fail("屏幕展示来源必须是 neutral-off 或 reference-bound");
  const prefix = `${assetId}-r${revision}`;
  const baseRelativePath = `assets/${prefix}.${baseExtension}`;
  const thumbnailRelativePath = `thumbnails/${prefix}.png`;
  const referenceRelativePath = request.reference.path;
  const thumbnailBytes = await sharp(baseBytes, { failOn: "error" })
    .resize(520, 390, { fit: "contain", background: { r: 24, g: 24, b: 24, alpha: 1 }, withoutEnlargement: true })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  const thumbnailSha256 = sha256Bytes(thumbnailBytes);
  const now = new Date().toISOString();
  const item = {
    id: assetId,
    revision,
    status: "testing",
    name: request.name,
    category: category.id,
    tags,
    renderer: "static-screen-v5",
    canvas: { width, height },
    screen: {
      quad: screenQuad,
      recommendedSize: { width: recommendedWidth, height: recommendedHeight, label: String(input.recommendedSize.label) },
      aperture: { quad: apertureQuad, cornerRadii },
      compositing: { mode: "aperture-mask" },
      presentation: {
        mode: screenPresentationMode,
        ...(screenPresentationMode === "reference-bound" ? { referenceSha256 } : {})
      },
      defaultFit: input.defaultFit === "contain" ? "contain" : "cover"
    },
    layers: { base: baseRelativePath },
    thumbnail: thumbnailRelativePath,
    provenance: {
      kind: "generated-in-house",
      usage: "candidate",
      pipelinePolicyId: policy.policyId,
      referenceRightsMode: request.reference.rightsMode,
      referenceSha256,
      candidateRequestId: request.requestId,
      candidateRequestSha256: requestSha256,
      generationNote: String(input.generationNote || "AI/agent-created complete candidate; generation details not supplied"),
      presentationState: "complete"
    },
    integrity: { baseSha256, thumbnailSha256 }
  };
  const completeBaseMetrics = await analyzeCompleteBase(baseBytes, item, {
    maximumGreenRatio: policy.quality.completeness.maximumDominantGreenRatio,
    maximumNeutralMeanChroma: policy.quality.completeness.maximumNeutralMeanChroma
  });
  item.provenance.completenessHeuristic = {
    result: completeBaseMetrics.pass ? "passed" : "human-review-required",
    detector: completeBaseMetrics.detector,
    greenDominantRatio: completeBaseMetrics.greenDominantRatio,
    maximumGreenRatio: completeBaseMetrics.maximumGreenRatio,
    presentationMode: completeBaseMetrics.presentationMode,
    meanChroma: completeBaseMetrics.meanChroma,
    maximumNeutralMeanChroma: completeBaseMetrics.maximumNeutralMeanChroma
  };
  const currentIndex = testing.items.findIndex((candidate) => candidate.id === assetId);
  const nextTesting = structuredClone(testing);
  if (currentIndex >= 0) nextTesting.items[currentIndex] = item;
  else nextTesting.items.push(item);
  nextTesting.catalogVersion = currentDateVersion(testing.catalogVersion);
  nextTesting.publishedAt = now;
  const itemSha256 = itemDigest(item);
  const nextState = structuredClone(state);
  const entry = {
    assetId,
    revision,
    policyId: policy.policyId,
    state: "REQUEST_AUTHORIZED",
    requestAuthorization: { requestId: request.requestId, path: requestSummary.requestPath, sha256: requestSha256 },
    reference: { path: referenceRelativePath, sha256: referenceSha256, rightsMode: request.reference.rightsMode },
    candidate: { basePath: baseRelativePath, baseSha256, thumbnailPath: thumbnailRelativePath, thumbnailSha256 },
    itemSha256,
    qa: null,
    releaseApproval: null,
    blockedReasons: [],
    nextAction: "",
    history: [
      { state: "REQUEST_AUTHORIZED", reason: "决定人已为该参考图授权一次候选创作委托", actor: request.actor.identity, at: request.authorizedAt },
      { state: "REFERENCE_RECORDED", reason: "参考图、权利模式和单次创作委托已绑定", actor: input.actor || "agent", at: now }
    ]
  };
  transition(entry, "CANDIDATE_READY", "候选素材包已原子准备并写入测试清单", input.actor || "agent");
  transition(entry, "TESTING", "候选写入后直接进入技术质检；不等待人工视觉、基线或构建批准", "system");
  nextState.assets[assetId] = entry;
  nextState.requests[request.requestId] = {
    ...requestSummary,
    status: "CONSUMED",
    consumedCount: 1,
    consumedBy: { assetId, revision, candidateSha256: baseSha256, consumedAt: now }
  };
  const catalogRoot = resolve(projectRoot, "catalog/testing/v1");
  const destinations = [
    [safeRelativePath(catalogRoot, baseRelativePath, "基础图"), baseBytes],
    [safeRelativePath(catalogRoot, thumbnailRelativePath, "缩略图"), thumbnailBytes]
  ];
  const created = [];
  const originalState = state;
  try {
    for (const [path, bytes] of destinations) if (await writeImmutableBytes(path, bytes)) created.push(path);
    await writeWorkflowState(projectRoot, nextState);
    await atomicWriteJson(testingManifestPath, nextTesting);
  } catch (error) {
    await Promise.all(created.map((path) => rm(path, { force: true }).catch(() => {})));
    await atomicWriteJson(resolve(projectRoot, STATE_RELATIVE_PATH), originalState).catch(() => {});
    await atomicWriteJson(testingManifestPath, testing).catch(() => {});
    throw error;
  }
  return { item, itemSha256, workflow: entry, catalogVersion: nextTesting.catalogVersion };
}

async function currentItem(projectRoot, assetId, revision) {
  const manifest = await readJson(resolve(projectRoot, TESTING_MANIFEST_RELATIVE_PATH), "测试库清单");
  const item = manifest.items.find((candidate) => sameItemIdentity(candidate, assetId, revision));
  if (!item) fail(`测试库中找不到 ${assetId} r${revision}`);
  return { manifest, item };
}

async function immutableApproval(path, record) {
  const existing = await readJson(path, "批准记录").catch((error) => error?.code === "ENOENT" ? null : Promise.reject(error));
  if (existing) {
    const binding = ["assetId", "revision", "candidateSha256", "itemSha256", "qaReportSha256", "batchFingerprint", "buildFingerprint", "hostEvidenceSha256", "decision"];
    if (binding.some((field) => Object.hasOwn(record, field) && existing[field] !== record[field])) fail(`批准记录已存在但绑定不同：${path}`);
    return { record: existing, created: false, sha256: await sha256File(path) };
  }
  await writeImmutableJson(path, record);
  return { record, created: true, sha256: await sha256File(path) };
}

export async function updateWorkflowAfterGeometry(projectRoot, item) {
  const state = await loadWorkflowState(projectRoot);
  const entry = state.assets[item.id];
  if (!entry || entry.revision !== item.revision) return null;
  entry.itemSha256 = itemDigest(item);
  entry.qa = null;
  entry.releaseApproval = null;
  transition(entry, "TESTING", "屏幕几何发生变化，旧技术 QA 与正式入库批准失效", "system");
  await writeWorkflowState(projectRoot, state);
  return entry;
}

export async function updateWorkflowAfterQa(projectRoot, item, report, reportPath) {
  const state = await loadWorkflowState(projectRoot);
  const entry = state.assets[item.id];
  if (!entry || entry.revision !== item.revision || !["TESTING", "QA_PASSED"].includes(entry.state)) fail(`${item.id} 尚未进入可记录技术 QA 的状态`);
  if (report.itemSha256 !== itemDigest(item)) fail("技术 QA 报告与当前清单项不一致");
  const qaReportSha256 = await sha256File(reportPath);
  entry.itemSha256 = report.itemSha256;
  entry.qa = { path: `catalog/testing/v1/approvals/${basename(reportPath)}`, sha256: qaReportSha256, approvedAt: report.approvedAt };
  entry.releaseApproval = null;
  transition(entry, "QA_PASSED", "十项自动检查、四种测试图和五项人工检查均已通过", "system");
  await writeWorkflowState(projectRoot, state);
  return entry;
}

async function currentBuildFingerprint(projectRoot) {
  const ui = await readFile(resolve(projectRoot, "plugin/ui.html"), "utf8").catch((error) => {
    if (error?.code === "ENOENT") fail("尚未生成当前插件构建；先运行 pnpm build");
    throw error;
  });
  const match = /const BUILD_FINGERPRINT = "((?:DEV|REL)-[A-F0-9]{12,64})"/.exec(ui);
  if (!match) fail("当前插件构建缺少可绑定的指纹");
  return match[1];
}

const REQUIRED_REAL_HOST_RESULTS = [
  "pluginOpened",
  "selectedFigmaImageImported",
  "hoverStable",
  "rightEdgeHorizontalOnly",
  "bottomEdgeVerticalOnly",
  "noCornerOrApertureLeak",
  "resetRestoresDefault"
];

async function currentRealHostEvidence(projectRoot, buildFingerprint, explicitRelativePath = "") {
  const relativePath = explicitRelativePath || `docs/evidence/asset-pipeline/real-host-${buildFingerprint}.json`;
  const path = safeRelativePath(projectRoot, relativePath, "真实 Figma 宿主证据");
  const evidence = await readJson(path, "真实 Figma 宿主证据").catch((error) => {
    if (error?.code === "ENOENT") fail(`当前构建 ${buildFingerprint} 尚未完成真实 Figma 宿主回归`);
    throw error;
  });
  if (evidence.schemaVersion !== 1 || evidence.evidenceType !== "real-figma-host-regression" || evidence.status !== "passed" || evidence.buildFingerprint !== buildFingerprint || evidence.host?.application !== "Figma+EX") {
    fail("真实 Figma 宿主证据身份、状态或构建绑定无效");
  }
  for (const result of REQUIRED_REAL_HOST_RESULTS) {
    if (evidence.results?.[result]?.passed !== true) fail(`真实 Figma 宿主证据未通过：${result}`);
  }
  return { relativePath, sha256: await sha256File(path), evidence };
}

function finalReviewCore(policy, buildFingerprint, hostEvidence, items) {
  return {
    schemaVersion: 1,
    reviewType: "final-local-library-batch",
    policyId: policy.policyId,
    policyRevision: policy.policyRevision,
    buildFingerprint,
    hostEvidencePath: hostEvidence.relativePath,
    hostEvidenceSha256: hostEvidence.sha256,
    decisionOptions: ["approve-and-promote-local", "reject"],
    items: items.map((item) => ({
      assetId: item.assetId,
      revision: item.revision,
      name: item.name,
      candidateSha256: item.candidateSha256,
      itemSha256: item.itemSha256,
      qaReportSha256: item.qaReportSha256,
      qaReportPath: item.qaReportPath,
      basePath: item.basePath,
      thumbnailPath: item.thumbnailPath
    })).sort((left, right) => left.assetId.localeCompare(right.assetId))
  };
}

export async function prepareFinalReview(projectRoot, options = {}) {
  const policy = await loadPolicy(projectRoot);
  const [state, testing, buildFingerprint] = await Promise.all([
    loadWorkflowState(projectRoot, policy),
    readJson(resolve(projectRoot, TESTING_MANIFEST_RELATIVE_PATH), "测试库清单"),
    currentBuildFingerprint(projectRoot)
  ]);
  const requestedIds = Array.isArray(options.assetIds) && options.assetIds.length ? new Set(options.assetIds) : null;
  const targets = testing.items.filter((item) => requestedIds ? requestedIds.has(item.id) : state.assets[item.id]?.state === "QA_PASSED");
  if (!targets.length) fail("没有已通过技术 QA 的样机可纳入最终审阅批次");
  if (requestedIds && targets.length !== requestedIds.size) fail("最终审阅批次包含不存在或未通过技术 QA 的样机");
  const items = [];
  for (const item of targets) {
    const entry = state.assets[item.id];
    if (!entry || entry.revision !== item.revision || entry.state !== "QA_PASSED") fail(`${item.id} 未达到最终审阅条件`);
    const qa = await currentTechnicalQa(projectRoot, item, testing.rendererVersion);
    items.push({
      assetId: item.id,
      revision: item.revision,
      name: item.name,
      candidateSha256: item.integrity?.baseSha256,
      itemSha256: itemDigest(item),
      qaReportSha256: qa.sha256,
      qaReportPath: qa.relativePath,
      basePath: `catalog/testing/v1/${item.layers.base}`,
      thumbnailPath: `catalog/testing/v1/${item.thumbnail}`
    });
  }
  const hostEvidence = await currentRealHostEvidence(projectRoot, buildFingerprint, options.hostEvidencePath);
  const core = finalReviewCore(policy, buildFingerprint, hostEvidence, items);
  const batchFingerprint = `sha256:${sha256Bytes(Buffer.from(JSON.stringify(core)))}`;
  const relativePath = `catalog/workflow/final-review-packets/${batchFingerprint.slice(7)}.json`;
  const path = resolve(projectRoot, relativePath);
  const existing = await readJson(path, "最终审阅包").catch((error) => error?.code === "ENOENT" ? null : Promise.reject(error));
  let packet;
  if (existing) {
    const { createdAt: _createdAt, batchFingerprint: _batchFingerprint, ...existingCore } = existing;
    if (existing.batchFingerprint !== batchFingerprint || JSON.stringify(existingCore) !== JSON.stringify(core)) fail("已存在的最终审阅包与当前批次冲突");
    packet = existing;
  } else {
    packet = { ...core, batchFingerprint, createdAt: new Date().toISOString() };
    await writeImmutableJson(path, packet);
  }
  return { packet, relativePath, reviewPacketSha256: await sha256File(path) };
}

export async function recordFinalBatchApproval(projectRoot, options) {
  if (options.confirmedByHuman !== true || !options.actor?.trim()) fail("最终批次决定必须来自明确的人类确认并记录决定人身份");
  const decision = options.decision === "reject" ? "reject" : "approve-and-promote-local";
  const prepared = await prepareFinalReview(projectRoot, { assetIds: options.assetIds, hostEvidencePath: options.hostEvidencePath });
  if (options.expectedBatchFingerprint !== prepared.packet.batchFingerprint) fail("最终批次指纹与当前审阅包不一致");
  const policy = await loadPolicy(projectRoot);
  const state = await loadWorkflowState(projectRoot, policy);
  const decidedAt = new Date().toISOString();
  const batchRecord = {
    schemaVersion: 1,
    approvalType: "final-batch",
    decision,
    batchFingerprint: prepared.packet.batchFingerprint,
    reviewPacketPath: prepared.relativePath,
    reviewPacketSha256: prepared.reviewPacketSha256,
    buildFingerprint: prepared.packet.buildFingerprint,
    hostEvidencePath: prepared.packet.hostEvidencePath,
    hostEvidenceSha256: prepared.packet.hostEvidenceSha256,
    items: prepared.packet.items.map(({ assetId, revision, itemSha256, qaReportSha256 }) => ({ assetId, revision, itemSha256, qaReportSha256 })),
    actor: { type: "human", identity: options.actor.trim(), role: options.role || "最终视觉与本地入库决定人" },
    decidedAt,
    attestation: { method: "local", confirmedByHuman: true }
  };
  const batchRelativePath = `catalog/workflow/final-approvals/${prepared.packet.batchFingerprint.slice(7)}.json`;
  const batchPath = resolve(projectRoot, batchRelativePath);
  const existingBatch = await readJson(batchPath, "最终批次决定").catch((error) => error?.code === "ENOENT" ? null : Promise.reject(error));
  if (existingBatch) {
    if (existingBatch.batchFingerprint !== batchRecord.batchFingerprint || existingBatch.actor?.identity !== batchRecord.actor.identity || existingBatch.decision !== batchRecord.decision) fail("最终批次决定已存在但绑定不同");
    batchRecord.decidedAt = existingBatch.decidedAt;
  } else {
    await writeImmutableJson(batchPath, batchRecord);
  }
  const results = [];
  for (const reviewed of prepared.packet.items) {
    const entry = state.assets[reviewed.assetId];
    if (!entry || entry.revision !== reviewed.revision || entry.state !== "QA_PASSED" || entry.itemSha256 !== reviewed.itemSha256 || entry.qa?.sha256 !== reviewed.qaReportSha256) fail(`${reviewed.assetId} 已不再符合已审阅批次`);
    if (decision === "reject") {
      entry.releaseApproval = null;
      transition(entry, "NEEDS_REVISION", "决定人对完成技术 QA 的准确批次作出一次不通过决定", options.actor.trim());
      results.push({ assetId: reviewed.assetId, revision: reviewed.revision, state: "NEEDS_REVISION" });
      continue;
    }
    const record = {
      schemaVersion: 2,
      approvalType: "release",
      decision: "approved",
      assetId: reviewed.assetId,
      revision: reviewed.revision,
      itemSha256: reviewed.itemSha256,
      qaReportSha256: reviewed.qaReportSha256,
      candidateSha256: reviewed.candidateSha256,
      completeBaseConfirmed: true,
      batchFingerprint: prepared.packet.batchFingerprint,
      reviewPacketPath: prepared.relativePath,
      reviewPacketSha256: prepared.reviewPacketSha256,
      buildFingerprint: prepared.packet.buildFingerprint,
      hostEvidencePath: prepared.packet.hostEvidencePath,
      hostEvidenceSha256: prepared.packet.hostEvidenceSha256,
      actor: structuredClone(batchRecord.actor),
      decidedAt: batchRecord.decidedAt,
      attestation: { method: "local", confirmedByHuman: true, batchDecisionPath: batchRelativePath }
    };
    const relativePath = `catalog/testing/v1/release-approvals/${reviewed.assetId}-r${reviewed.revision}.json`;
    const result = await immutableApproval(resolve(projectRoot, relativePath), record);
    entry.releaseApproval = {
      path: relativePath,
      sha256: result.sha256,
      itemSha256: reviewed.itemSha256,
      qaReportSha256: reviewed.qaReportSha256,
      batchFingerprint: prepared.packet.batchFingerprint,
      reviewPacketPath: prepared.relativePath,
      reviewPacketSha256: prepared.reviewPacketSha256,
      buildFingerprint: prepared.packet.buildFingerprint,
      hostEvidencePath: prepared.packet.hostEvidencePath,
      hostEvidenceSha256: prepared.packet.hostEvidenceSha256
    };
    transition(entry, "FINAL_APPROVED", "决定人对完成技术 QA 的准确批次作出一次通过并入库决定", options.actor.trim());
    results.push({ assetId: reviewed.assetId, revision: reviewed.revision, approvalPath: relativePath });
  }
  await writeWorkflowState(projectRoot, state);
  return { batch: batchRecord, approvals: results, workflowState: decision === "reject" ? "NEEDS_REVISION" : "FINAL_APPROVED" };
}

export async function currentReleaseApproval(projectRoot, item) {
  const state = await loadWorkflowState(projectRoot);
  const entry = state.assets[item.id];
  if (!entry || entry.revision !== item.revision || entry.state !== "FINAL_APPROVED" || !entry.releaseApproval?.path) fail(`${item.id} 缺少当前批次的人类最终决定`);
  const approvalPath = safeRelativePath(projectRoot, entry.releaseApproval.path, "正式入库批准");
  const approval = await readJson(approvalPath, "正式入库批准");
  const approvalSha256 = await sha256File(approvalPath);
  const currentItemSha256 = itemDigest(item);
  const qaPath = safeRelativePath(projectRoot, entry.qa?.path, "技术 QA 报告");
  const qaReportSha256 = await sha256File(qaPath);
  const buildFingerprint = await currentBuildFingerprint(projectRoot);
  const reviewPacketPath = safeRelativePath(projectRoot, entry.releaseApproval.reviewPacketPath, "最终审阅包");
  const reviewPacket = await readJson(reviewPacketPath, "最终审阅包");
  const reviewPacketSha256 = await sha256File(reviewPacketPath);
  const hostEvidence = await currentRealHostEvidence(projectRoot, buildFingerprint, reviewPacket.hostEvidencePath);
  if (approvalSha256 !== entry.releaseApproval.sha256 || approval.schemaVersion !== 2 || approval.approvalType !== "release" || approval.decision !== "approved" || approval.assetId !== item.id || approval.revision !== item.revision || approval.itemSha256 !== currentItemSha256 || approval.qaReportSha256 !== qaReportSha256 || approval.batchFingerprint !== entry.releaseApproval.batchFingerprint || approval.batchFingerprint !== reviewPacket.batchFingerprint || approval.reviewPacketSha256 !== reviewPacketSha256 || approval.buildFingerprint !== buildFingerprint || approval.buildFingerprint !== reviewPacket.buildFingerprint || approval.hostEvidenceSha256 !== hostEvidence.sha256 || approval.hostEvidenceSha256 !== reviewPacket.hostEvidenceSha256 || approval.hostEvidenceSha256 !== entry.releaseApproval.hostEvidenceSha256 || approval.completeBaseConfirmed !== true) fail(`${item.id} 的人类最终批次决定已过期或无效`);
  return { approval, approvalSha256, qaReportSha256, entry };
}

async function currentTechnicalQa(projectRoot, item, rendererVersion) {
  const relativePath = `catalog/testing/v1/approvals/${item.id}-r${item.revision}.json`;
  const path = safeRelativePath(projectRoot, relativePath, "技术 QA 报告");
  const report = await readJson(path, "技术 QA 报告").catch((error) => {
    if (error?.code === "ENOENT") fail(`${item.id} 尚未在样机质检台通过技术 QA`);
    throw error;
  });
  if (report.schemaVersion !== 3 || report.status !== "approved" || report.assetId !== item.id || report.revision !== item.revision) fail(`${item.id} 的技术 QA 报告身份无效`);
  const completeBasePass = report.completeBaseMetrics?.pass === true || report.completeBaseMetrics?.technicalPass === true;
  if (report.rendererVersion !== rendererVersion || report.itemSha256 !== itemDigest(item) || report.apertureMetrics?.pass !== true || !completeBasePass) fail(`${item.id} 的技术 QA 报告已过期或无效`);
  return { report, path, relativePath, sha256: await sha256File(path) };
}

async function assertCopyPlan(sourcePath, destinationPath, label) {
  const source = await readFile(sourcePath).catch((error) => {
    if (error?.code === "ENOENT") fail(`${label} 源文件不存在`);
    throw error;
  });
  const destination = await readFile(destinationPath).catch((error) => error?.code === "ENOENT" ? null : Promise.reject(error));
  if (destination && !destination.equals(source)) fail(`${label} 的正式库不可变路径已存在不同字节`);
  return { sourcePath, destinationPath, sha256: sha256Bytes(source) };
}

export async function promoteAssets(projectRoot, options = {}) {
  const policy = await loadPolicy(projectRoot);
  const testingRoot = resolve(projectRoot, "catalog/testing/v1");
  const productionRoot = resolve(projectRoot, "catalog/production/v1");
  const testingManifestPath = resolve(projectRoot, TESTING_MANIFEST_RELATIVE_PATH);
  const productionManifestPath = resolve(projectRoot, PRODUCTION_MANIFEST_RELATIVE_PATH);
  const [testing, production, state] = await Promise.all([
    readJson(testingManifestPath, "测试库清单"),
    readJson(productionManifestPath, "正式库清单"),
    loadWorkflowState(projectRoot, policy)
  ]);
  if (testing.schemaVersion !== policy.quality.catalogSchemaVersion || testing.rendererVersion !== policy.quality.rendererVersion || testing.environment !== "testing") fail("测试库与当前流水线政策不兼容");
  if (production.schemaVersion !== testing.schemaVersion || production.rendererVersion !== testing.rendererVersion || production.environment !== "production") fail("正式库与测试库规范不兼容");
  const targets = options.all === true
    ? testing.items
    : testing.items.filter((item) => item.id === options.assetId);
  if (!targets.length) fail(`测试库中找不到样机：${options.assetId || "未指定"}`);

  const plans = [];
  const copyPlans = new Map();
  for (const item of targets) {
    const qa = await currentTechnicalQa(projectRoot, item, testing.rendererVersion);
    const managed = item.provenance?.pipelinePolicyId === policy.policyId;
    const existingProduction = production.items.find((candidate) => sameItemIdentity(candidate, item.id, item.revision));
    if (!managed && !existingProduction) fail(`${item.id} 是旧式素材且尚未在正式库中；必须通过当前流水线重新导入后才能提升`);
    const release = managed ? await currentReleaseApproval(projectRoot, item) : null;
    if (managed) {
      const entry = state.assets[item.id];
      if (!entry || entry.revision !== item.revision || entry.state !== "FINAL_APPROVED") fail(`${item.id} 的工作流状态未获得当前最终批次决定`);
    }

    const resourcePaths = new Set([item.thumbnail, ...Object.values(item.layers || {}).filter((value) => typeof value === "string")]);
    for (const relativePath of resourcePaths) {
      const sourcePath = safeRelativePath(testingRoot, relativePath, `${item.id} 素材`);
      const destinationPath = safeRelativePath(productionRoot, relativePath, `${item.id} 正式素材`);
      const copyPlan = await assertCopyPlan(sourcePath, destinationPath, `${item.id}/${relativePath}`);
      const integrityKey = relativePath === item.thumbnail
        ? "thumbnailSha256"
        : `${Object.entries(item.layers || {}).find(([, value]) => value === relativePath)?.[0] || ""}Sha256`;
      if (copyPlan.sha256 !== item.integrity?.[integrityKey]) fail(`${item.id} 的素材摘要与清单不一致：${relativePath}`);
      copyPlans.set(destinationPath, copyPlan);
    }

    const qaDestinationRelativePath = `approvals/${item.id}-r${item.revision}.json`;
    const qaCopyPlan = await assertCopyPlan(qa.path, safeRelativePath(productionRoot, qaDestinationRelativePath, `${item.id} 正式 QA 报告`), `${item.id} 技术 QA 报告`);
    copyPlans.set(qaCopyPlan.destinationPath, qaCopyPlan);
    let releaseDestinationRelativePath = null;
    if (release) {
      releaseDestinationRelativePath = `release-approvals/${item.id}-r${item.revision}.json`;
      const releaseCopyPlan = await assertCopyPlan(
        safeRelativePath(projectRoot, release.entry.releaseApproval.path, "正式入库批准"),
        safeRelativePath(productionRoot, releaseDestinationRelativePath, `${item.id} 正式入库批准记录`),
        `${item.id} 正式入库批准记录`
      );
      if (releaseCopyPlan.sha256 !== release.approvalSha256) fail(`${item.id} 的正式入库批准摘要不一致`);
      copyPlans.set(releaseCopyPlan.destinationPath, releaseCopyPlan);
    }
    plans.push({ item, qa, release, managed, qaDestinationRelativePath, releaseDestinationRelativePath });
  }

  const nextProduction = structuredClone(production);
  nextProduction.schemaVersion = testing.schemaVersion;
  nextProduction.rendererVersion = testing.rendererVersion;
  for (const plan of plans) {
    const published = {
      ...structuredClone(plan.item),
      status: "approved",
      qa: {
        approvedAt: plan.qa.report.approvedAt,
        rendererVersion: plan.qa.report.rendererVersion,
        sourceItemSha256: plan.qa.report.itemSha256,
        reportSha256: plan.qa.sha256,
        report: plan.qaDestinationRelativePath
      }
    };
    if (plan.release) {
      published.release = {
        decidedAt: plan.release.approval.decidedAt,
        actor: structuredClone(plan.release.approval.actor),
        sourceItemSha256: plan.release.approval.itemSha256,
        qaReportSha256: plan.release.approval.qaReportSha256,
        reportSha256: plan.release.approvalSha256,
        report: plan.releaseDestinationRelativePath,
        batchFingerprint: plan.release.approval.batchFingerprint,
        buildFingerprint: plan.release.approval.buildFingerprint,
        reviewPacketSha256: plan.release.approval.reviewPacketSha256
      };
    }
    const index = nextProduction.items.findIndex((candidate) => candidate.id === plan.item.id);
    if (index >= 0) nextProduction.items[index] = published;
    else nextProduction.items.push(published);
    const category = testing.categories.find((candidate) => candidate.id === plan.item.category);
    if (category && !nextProduction.categories.some((candidate) => candidate.id === category.id)) nextProduction.categories.push(structuredClone(category));
  }
  const testingOrder = new Map(testing.items.map((item, index) => [item.id, index]));
  nextProduction.items.sort((left, right) => (testingOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (testingOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER));
  nextProduction.catalogVersion = currentDateVersion(production.catalogVersion);
  nextProduction.publishedAt = new Date().toISOString();

  await snapshotCatalog(projectRoot, "production");
  for (const plan of copyPlans.values()) await copyImmutableFile(plan.sourcePath, plan.destinationPath);
  await snapshotCatalogManifest(projectRoot, "production", nextProduction);
  await atomicWriteJson(productionManifestPath, nextProduction);

  for (const plan of plans) {
    if (!plan.managed) continue;
    const entry = state.assets[plan.item.id];
    entry.productionVersion = nextProduction.catalogVersion;
    transition(entry, "PROMOTED", `已进入本地正式库 ${nextProduction.catalogVersion}`, "system");
  }
  await writeWorkflowState(projectRoot, state);
  return {
    catalogVersion: nextProduction.catalogVersion,
    itemCount: nextProduction.items.length,
    promoted: plans.map(({ item }) => ({ assetId: item.id, revision: item.revision, name: item.name }))
  };
}

export async function quarantineCandidate(projectRoot, options) {
  if (!options.assetId || !options.reason?.trim() || !options.actor?.trim()) fail("隔离候选必须提供资产、原因和执行者");
  const policy = await loadPolicy(projectRoot);
  const testingManifestPath = resolve(projectRoot, TESTING_MANIFEST_RELATIVE_PATH);
  const [state, testing] = await Promise.all([
    loadWorkflowState(projectRoot, policy),
    readJson(testingManifestPath, "测试库清单")
  ]);
  const entry = state.assets[options.assetId];
  if (!entry) fail("找不到要隔离的候选状态");
  if (["FINAL_APPROVED", "PROMOTED"].includes(entry.state)) fail("已获最终批次决定或已提升的资产不能通过候选隔离撤下");
  const itemIndex = testing.items.findIndex((item) => sameItemIdentity(item, entry.assetId, entry.revision));
  if (itemIndex < 0) fail("测试库中找不到当前候选");
  const item = testing.items[itemIndex];
  if (itemDigest(item) !== entry.itemSha256) fail("要隔离的候选与工作流摘要不一致");
  const quarantineRootRelative = `catalog/workflow/quarantine/${entry.assetId}-r${entry.revision}`;
  const resources = [
    { source: safeRelativePath(resolve(projectRoot, "catalog/testing/v1"), item.layers.base, "候选基础图"), name: `base-${basename(item.layers.base)}`, sha256: item.integrity.baseSha256 },
    { source: safeRelativePath(resolve(projectRoot, "catalog/testing/v1"), item.thumbnail, "候选缩略图"), name: `thumbnail-${basename(item.thumbnail)}`, sha256: item.integrity.thumbnailSha256 },
    { source: safeRelativePath(projectRoot, entry.reference.path, "候选参考图"), name: `reference-${basename(entry.reference.path)}`, sha256: entry.reference.sha256 }
  ];
  const copied = [];
  for (const resource of resources) {
    if (await sha256File(resource.source) !== resource.sha256) fail(`隔离前摘要不一致：${resource.name}`);
    const destinationRelative = `${quarantineRootRelative}/${resource.name}`;
    await copyImmutableFile(resource.source, resolve(projectRoot, destinationRelative));
    copied.push({ path: destinationRelative, sha256: resource.sha256 });
  }
  const nextTesting = structuredClone(testing);
  nextTesting.items.splice(itemIndex, 1);
  nextTesting.catalogVersion = currentDateVersion(testing.catalogVersion);
  nextTesting.publishedAt = new Date().toISOString();
  const nextState = structuredClone(state);
  const nextEntry = nextState.assets[options.assetId];
  nextEntry.quarantine = {
    reason: options.reason.trim(),
    actor: options.actor.trim(),
    quarantinedAt: nextTesting.publishedAt,
    files: copied
  };
  transition(nextEntry, "REJECTED", options.reason.trim(), options.actor.trim());
  try {
    await snapshotCatalog(projectRoot, "testing");
    await snapshotCatalogManifest(projectRoot, "testing", nextTesting);
    await writeWorkflowState(projectRoot, nextState);
    await atomicWriteJson(testingManifestPath, nextTesting);
  } catch (error) {
    await atomicWriteJson(resolve(projectRoot, STATE_RELATIVE_PATH), state).catch(() => {});
    await atomicWriteJson(testingManifestPath, testing).catch(() => {});
    throw error;
  }
  await Promise.all(resources.map((resource) => rm(resource.source, { force: true })));
  return {
    assetId: entry.assetId,
    revision: entry.revision,
    state: "REJECTED",
    catalogVersion: nextTesting.catalogVersion,
    quarantine: nextEntry.quarantine
  };
}

export async function inspectWorkflow(projectRoot) {
  const policy = await loadPolicy(projectRoot);
  const [state, testing] = await Promise.all([
    loadWorkflowState(projectRoot, policy),
    readJson(resolve(projectRoot, TESTING_MANIFEST_RELATIVE_PATH), "测试库清单")
  ]);
  const assets = [];
  for (const entry of Object.values(state.assets)) {
    const item = testing.items.find((candidate) => sameItemIdentity(candidate, entry.assetId, entry.revision));
    const issues = [];
    if (!item && entry.state !== "REJECTED") issues.push("当前 revision 不在测试清单中");
    else {
      if (item && itemDigest(item) !== entry.itemSha256 && !["CANDIDATE_READY", "TESTING"].includes(entry.state)) issues.push("状态绑定的 itemSha256 已漂移");
      if (item && item.integrity?.baseSha256 !== entry.candidate?.baseSha256) issues.push("候选基础图摘要已漂移");
    }
    assets.push({
      assetId: entry.assetId,
      revision: entry.revision,
      state: issues.length ? "BLOCKED" : entry.state,
      issues,
      nextAction: issues.length ? "先修复状态与真实文件不一致" : entry.nextAction,
      technicalQa: entry.qa ? {
        reportSha256: entry.qa.sha256,
        approvedAt: entry.qa.approvedAt
      } : null,
      finalApproval: entry.releaseApproval ? {
        batchFingerprint: entry.releaseApproval.batchFingerprint,
        buildFingerprint: entry.releaseApproval.buildFingerprint
      } : null
    });
  }
  const requests = Object.values(state.requests).map((request) => ({
    requestId: request.requestId,
    status: request.status,
    assetId: request.assetId,
    maximumCandidates: request.maximumCandidates,
    consumedCount: request.consumedCount,
    consumedBy: request.consumedBy
  }));
  const authorizedRequests = requests.filter((request) => request.status === "AUTHORIZED");
  const activeAssets = assets.filter((asset) => !["PROMOTED", "REJECTED"].includes(asset.state));
  const workflowState = authorizedRequests.length
    ? "REQUEST_AUTHORIZED"
    : activeAssets.length === 1
      ? activeAssets[0].state
      : activeAssets.length > 1
        ? "ACTIVE_CANDIDATES"
        : "WAITING_FOR_USER_INPUT";
  const workflowNextAction = authorizedRequests.length
    ? "只能消耗一个已授权委托制作对应候选"
    : activeAssets.length === 1
      ? activeAssets[0].nextAction
      : activeAssets.length > 1
        ? "按 assets 中每个活动候选的 nextAction 继续；技术步骤由系统执行，只在最终批次请求一次人类决定"
        : "等待决定人提供新参考截图并明确要求制作一个候选";
  return {
    policyId: policy.policyId,
    updatedAt: state.updatedAt,
    workflowState,
    nextAction: workflowNextAction,
    requests,
    assets
  };
}

export function parseJsonOption(value, label) {
  try { return JSON.parse(value); }
  catch { fail(`${label} 必须是有效 JSON`); }
}

export function parseRecommendedSize(value) {
  const match = /^(\d+)x(\d+)(?::(.+))?$/.exec(value || "");
  if (!match) fail("--recommended 必须是 宽x高:标签，例如 1170x2532:手机竖屏");
  return { width: Number(match[1]), height: Number(match[2]), label: match[3] || `${match[1]}:${match[2]}` };
}
