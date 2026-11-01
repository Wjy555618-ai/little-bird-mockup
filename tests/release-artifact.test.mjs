import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { inspectReleaseArtifact, inspectReleaseBundle, RELEASE_CATALOG_FILE, RELEASE_PROVENANCE_FILE } from "../scripts/lib/release-artifact.mjs";

const expectedBundle = {
  version: "0.1.0",
  sourceRevision: "a".repeat(40),
  measurementPolicySha256: "b".repeat(64),
  contractId: "MOCKUP-STUDIO-PRODUCTION-CONTRACT-1",
  contractSha256: "c".repeat(64)
};

async function artifact(files = {}) {
  const directory = await mkdtemp(resolve(tmpdir(), "mockup-release-artifact-"));
  await Promise.all([
    writeFile(resolve(directory, "ui.html"), files.ui ?? "<p>REL-123456789ABC</p>"),
    writeFile(resolve(directory, "manifest.json"), files.manifest ?? "{}\n"),
    writeFile(resolve(directory, "code.js"), files.code ?? "void 0;\n")
  ]);
  return directory;
}

async function addProvenance(directory, overrides = {}) {
  const inspected = await inspectReleaseArtifact(directory);
  const catalogSource = `${JSON.stringify({ catalogVersion: "2026.10.30.2" }, null, 2)}\n`;
  await writeFile(resolve(directory, RELEASE_CATALOG_FILE), catalogSource);
  const provenance = {
    schemaVersion: 1,
    provenanceType: "mockup-studio-release",
    contractId: "MOCKUP-STUDIO-PRODUCTION-CONTRACT-1",
    contractSha256: expectedBundle.contractSha256,
    version: expectedBundle.version,
    sourceTag: `v${expectedBundle.version}`,
    sourceRevision: expectedBundle.sourceRevision,
    buildFingerprint: inspected.fingerprint,
    artifactSha256: inspected.sha256,
    measurementPolicySha256: expectedBundle.measurementPolicySha256,
    catalogVersion: "2026.10.30.2",
    catalogManifestSha256: createHash("sha256").update(catalogSource).digest("hex"),
    createdAt: "2026-11-01T00:00:00.000Z",
    ...overrides
  };
  await writeFile(resolve(directory, RELEASE_PROVENANCE_FILE), `${JSON.stringify(provenance, null, 2)}\n`);
}

test("release artifact digest and fingerprint are derived from actual artifact bytes", async () => {
  const directory = await artifact();
  try {
    const first = await inspectReleaseArtifact(directory);
    const second = await inspectReleaseArtifact(directory);
    assert.match(first.sha256, /^[a-f0-9]{64}$/);
    assert.equal(first.sha256, second.sha256);
    assert.equal(first.fingerprint, "REL-123456789ABC");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("release artifact digest uses file boundaries and changes for redistributed bytes", async () => {
  const left = await artifact({ manifest: "{\"a\":\"bc\"}", code: "d" });
  const right = await artifact({ manifest: "{\"a\":\"b\"}", code: "cd" });
  try {
    assert.notEqual((await inspectReleaseArtifact(left)).sha256, (await inspectReleaseArtifact(right)).sha256);
  } finally {
    await rm(left, { recursive: true, force: true });
    await rm(right, { recursive: true, force: true });
  }
});

test("release artifact rejects missing or ambiguous REL fingerprints", async () => {
  const missing = await artifact({ ui: "<p>no fingerprint</p>" });
  const ambiguous = await artifact({ ui: "REL-123456789ABC REL-FFFFFFFFFFFF" });
  try {
    await assert.rejects(inspectReleaseArtifact(missing), /唯一 REL 指纹/);
    await assert.rejects(inspectReleaseArtifact(ambiguous), /唯一 REL 指纹/);
  } finally {
    await rm(missing, { recursive: true, force: true });
    await rm(ambiguous, { recursive: true, force: true });
  }
});

test("release bundle binds provenance to artifact bytes, tag revision and measurement policy", async () => {
  const directory = await artifact();
  try {
    await addProvenance(directory);
    const bundle = await inspectReleaseBundle(directory, expectedBundle);
    assert.equal(bundle.provenance.sourceRevision, expectedBundle.sourceRevision);
    assert.equal(bundle.provenance.artifactSha256, bundle.sha256);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("release bundle rejects missing and drifted provenance", async () => {
  const missing = await artifact();
  const wrongDigest = await artifact();
  const wrongPolicy = await artifact();
  const wrongContract = await artifact();
  const wrongCatalog = await artifact();
  try {
    await assert.rejects(inspectReleaseBundle(missing, expectedBundle), /缺少或无法解析/);
    await addProvenance(wrongDigest, { artifactSha256: "0".repeat(64) });
    await assert.rejects(inspectReleaseBundle(wrongDigest, expectedBundle), /摘要绑定错误/);
    await addProvenance(wrongPolicy, { measurementPolicySha256: "0".repeat(64) });
    await assert.rejects(inspectReleaseBundle(wrongPolicy, expectedBundle), /政策摘要绑定错误/);
    await addProvenance(wrongContract, { contractSha256: "0".repeat(64) });
    await assert.rejects(inspectReleaseBundle(wrongContract, expectedBundle), /合同摘要绑定错误/);
    await addProvenance(wrongCatalog);
    await writeFile(resolve(wrongCatalog, RELEASE_CATALOG_FILE), `${JSON.stringify({ catalogVersion: "2026.10.30.3" })}\n`);
    await assert.rejects(inspectReleaseBundle(wrongCatalog, expectedBundle), /目录版本绑定错误|目录摘要绑定错误/);
  } finally {
    await rm(missing, { recursive: true, force: true });
    await rm(wrongDigest, { recursive: true, force: true });
    await rm(wrongPolicy, { recursive: true, force: true });
    await rm(wrongContract, { recursive: true, force: true });
    await rm(wrongCatalog, { recursive: true, force: true });
  }
});
