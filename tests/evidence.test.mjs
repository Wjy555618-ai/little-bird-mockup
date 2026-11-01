import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { contractSha256, measurementPolicySha256, validateEvidenceDocument } from "../scripts/verify-evidence.mjs";

const fingerprint = "REL-123456789ABC";
const sourceRevision = "a".repeat(40);
const artifactSha256 = "b".repeat(64);
const catalogVersion = "2026.10.30.2";
const catalogManifestSha256 = "c".repeat(64);
const rawEvidence = "raw measurement evidence\n";
const rawEvidenceRef = {
  path: "raw.txt",
  bytes: Buffer.byteLength(rawEvidence),
  sha256: createHash("sha256").update(rawEvidence).digest("hex")
};

function scenario(id, measurements) {
  return {
    id,
    status: "PASS",
    startedAt: "2026-11-01T00:00:00.000Z",
    finishedAt: "2026-11-01T00:01:00.000Z",
    environment: { device: "minimum-supported-test-device", host: "Figma Desktop" },
    input: { fixture: id },
    result: { outcome: "completed" },
    measurements,
    evidenceRefs: [{ ...rawEvidenceRef }]
  };
}

function validPerformanceEvidence() {
  return {
    schemaVersion: 1,
    gateId: "G-120",
    evidenceId: "PERF-VALID-001",
    measurementPolicySha256,
    createdAt: "2026-11-01T01:00:00.000Z",
    ownerRole: "performance owner",
    release: {
      version: "0.1.0",
      fingerprint,
      sourceRevision,
      artifactSha256,
      contractSha256,
      catalogVersion,
      catalogManifestSha256
    },
    scenarios: [
      scenario("cold-start", { sampleCount: 10, interactiveP95Ms: 2500 }),
      scenario("500-item-catalog", { itemCount: 500, searchSampleCount: 30, searchP95Ms: 100, initialRenderP95Ms: 1500 }),
      scenario("rapid-switch-50", { switchCount: 50, latestSelectionCorrect: true, failedTasks: 0 }),
      scenario("large-image", { megapixels: 32, completionMs: 5000, success: true }),
      scenario("large-pdf", { fileBytes: 52428800, pageCount: 50, firstPageMs: 5000, success: true }),
      scenario("memory-after-50-switches", { switchCount: 50, maxCatalogCacheEntries: 8, retainedIncreaseMiB: 150, crashes: 0 })
    ]
  };
}

async function fixture() {
  const directory = await mkdtemp(resolve(tmpdir(), "mockup-evidence-"));
  const filePath = resolve(directory, "performance-budget.json");
  await writeFile(resolve(directory, "raw.txt"), rawEvidence);
  return { directory, filePath };
}

async function validate(document, filePath) {
  return validateEvidenceDocument(document, {
    gateId: "G-120",
    version: "0.1.0",
    fingerprint,
    sourceRevision,
    artifactSha256,
    contractSha256,
    catalogVersion,
    catalogManifestSha256,
    now: new Date("2026-11-02T00:00:00.000Z"),
    enforcePath: false,
    filePath
  });
}

test("manual evidence passes only when every required scenario meets its preregistered threshold", async () => {
  const { directory, filePath } = await fixture();
  try {
    assert.equal(await validate(validPerformanceEvidence(), filePath), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("manual evidence rejects missing and skipped scenarios", async () => {
  const { directory, filePath } = await fixture();
  try {
    const missing = validPerformanceEvidence();
    missing.scenarios.pop();
    await assert.rejects(validate(missing, filePath), /缺少场景/);
    const skipped = validPerformanceEvidence();
    skipped.scenarios[0].status = "SKIP";
    await assert.rejects(validate(skipped, filePath), /未通过或被跳过/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("manual evidence rejects a different release fingerprint", async () => {
  const { directory, filePath } = await fixture();
  try {
    const document = validPerformanceEvidence();
    document.release.fingerprint = "REL-FFFFFFFFFFFF";
    await assert.rejects(validate(document, filePath), /发布指纹绑定错误/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("manual evidence rejects source, artifact and catalog values not bound to the verifier inputs", async () => {
  const { directory, filePath } = await fixture();
  try {
    const wrongRevision = validPerformanceEvidence();
    wrongRevision.release.sourceRevision = "c".repeat(40);
    await assert.rejects(validate(wrongRevision, filePath), /源提交绑定错误/);
    const wrongArtifact = validPerformanceEvidence();
    wrongArtifact.release.artifactSha256 = "d".repeat(64);
    await assert.rejects(validate(wrongArtifact, filePath), /制品摘要绑定错误/);
    const wrongContract = validPerformanceEvidence();
    wrongContract.release.contractSha256 = "f".repeat(64);
    await assert.rejects(validate(wrongContract, filePath), /合同摘要绑定错误/);
    const wrongCatalogVersion = validPerformanceEvidence();
    wrongCatalogVersion.release.catalogVersion = "2026.10.30.3";
    await assert.rejects(validate(wrongCatalogVersion, filePath), /目录版本绑定错误/);
    const wrongCatalogDigest = validPerformanceEvidence();
    wrongCatalogDigest.release.catalogManifestSha256 = "e".repeat(64);
    await assert.rejects(validate(wrongCatalogDigest, filePath), /目录摘要绑定错误/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("manual evidence rejects a different measurement policy digest", async () => {
  const { directory, filePath } = await fixture();
  try {
    const document = validPerformanceEvidence();
    document.measurementPolicySha256 = "0".repeat(64);
    await assert.rejects(validate(document, filePath), /测量政策摘要绑定错误/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("manual evidence rejects measurements collected before policy registration", async () => {
  const { directory, filePath } = await fixture();
  try {
    const document = validPerformanceEvidence();
    document.scenarios[0].startedAt = "2026-10-31T00:00:00.000Z";
    document.scenarios[0].finishedAt = "2026-10-31T00:01:00.000Z";
    await assert.rejects(validate(document, filePath), /测量早于政策登记时间/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("manual evidence rejects future documents and measurements ending after document creation", async () => {
  const { directory, filePath } = await fixture();
  try {
    const future = validPerformanceEvidence();
    future.createdAt = "2026-11-03T00:00:00.000Z";
    await assert.rejects(validate(future, filePath), /创建时间位于未来/);
    const impossibleOrder = validPerformanceEvidence();
    impossibleOrder.createdAt = "2026-11-01T00:00:30.000Z";
    await assert.rejects(validate(impossibleOrder, filePath), /测量结束时间晚于证据创建时间/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("manual evidence rejects measurements outside a preregistered budget", async () => {
  const { directory, filePath } = await fixture();
  try {
    const document = validPerformanceEvidence();
    document.scenarios.find((item) => item.id === "500-item-catalog").measurements.searchP95Ms = 101;
    await assert.rejects(validate(document, filePath), /searchP95Ms lte 100/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("manual evidence rejects missing and escaping attachment paths", async () => {
  const { directory, filePath } = await fixture();
  try {
    const missing = validPerformanceEvidence();
    missing.scenarios[0].evidenceRefs = [{ ...rawEvidenceRef, path: "missing.log" }];
    await assert.rejects(validate(missing, filePath), /附件不存在或为空/);
    const escaping = validPerformanceEvidence();
    escaping.scenarios[0].evidenceRefs = [{ ...rawEvidenceRef, path: "../outside.log" }];
    await assert.rejects(validate(escaping, filePath), /证据目录内/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("manual evidence rejects an attachment symlink that escapes the evidence directory", async () => {
  const { directory, filePath } = await fixture();
  const externalDirectory = await mkdtemp(resolve(tmpdir(), "mockup-evidence-external-"));
  try {
    await writeFile(resolve(externalDirectory, "outside.txt"), "outside evidence\n");
    await symlink(resolve(externalDirectory, "outside.txt"), resolve(directory, "linked.txt"));
    const document = validPerformanceEvidence();
    const outside = "outside evidence\n";
    document.scenarios[0].evidenceRefs = [{
      path: "linked.txt",
      bytes: Buffer.byteLength(outside),
      sha256: createHash("sha256").update(outside).digest("hex")
    }];
    await assert.rejects(validate(document, filePath), /附件真实路径必须位于证据目录内/);
  } finally {
    await rm(directory, { recursive: true, force: true });
    await rm(externalDirectory, { recursive: true, force: true });
  }
});

test("manual evidence rejects attachment byte or digest drift", async () => {
  const { directory, filePath } = await fixture();
  try {
    const wrongBytes = validPerformanceEvidence();
    wrongBytes.scenarios[0].evidenceRefs[0].bytes += 1;
    await assert.rejects(validate(wrongBytes, filePath), /附件字节数绑定错误/);
    const wrongDigest = validPerformanceEvidence();
    wrongDigest.scenarios[0].evidenceRefs[0].sha256 = "0".repeat(64);
    await assert.rejects(validate(wrongDigest, filePath), /附件SHA-256绑定错误/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("manual evidence rejects empty evidence objects, unknown scenarios and a non-contract path", async () => {
  const { directory, filePath } = await fixture();
  try {
    const emptyEnvironment = validPerformanceEvidence();
    emptyEnvironment.scenarios[0].environment = {};
    await assert.rejects(validate(emptyEnvironment, filePath), /必须是非空对象/);
    const unknown = validPerformanceEvidence();
    unknown.scenarios.push(scenario("unregistered-scenario", { success: true }));
    await assert.rejects(validate(unknown, filePath), /合同未定义的场景/);
    const wrongPath = validPerformanceEvidence();
    await assert.rejects(validateEvidenceDocument(wrongPath, {
      gateId: "G-120",
      version: "0.1.0",
      fingerprint,
      sourceRevision,
      artifactSha256,
      contractSha256,
      catalogVersion,
      catalogManifestSha256,
      now: new Date("2026-11-02T00:00:00.000Z"),
      filePath
    }), /证据文件路径不符合合同/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
