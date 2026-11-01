import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const RELEASE_ARTIFACT_FILES = ["ui.html", "manifest.json", "code.js"];
export const RELEASE_PROVENANCE_FILE = "release-provenance.json";
export const RELEASE_CATALOG_FILE = "catalog-manifest.json";

export async function inspectReleaseArtifact(artifactRoot) {
  const files = await Promise.all(RELEASE_ARTIFACT_FILES.map(async (name) => ({
    name,
    bytes: await readFile(resolve(artifactRoot, name))
  })));
  const hash = createHash("sha256");
  hash.update("mockup-studio-release-artifact-v1\0");
  for (const file of files) {
    hash.update(`${file.name}\0${file.bytes.length}\0`);
    hash.update(file.bytes);
  }

  const ui = files.find((file) => file.name === "ui.html").bytes.toString("utf8");
  const fingerprints = [...new Set(ui.match(/REL-[A-F0-9]{12}/g) || [])];
  if (fingerprints.length !== 1) {
    throw new Error(`生产制品必须包含且只能包含一个唯一 REL 指纹，实际为 ${fingerprints.length} 个`);
  }

  return {
    sha256: hash.digest("hex"),
    fingerprint: fingerprints[0],
    files: Object.fromEntries(files.map((file) => [file.name, file.bytes]))
  };
}

export async function inspectReleaseBundle(artifactRoot, expected) {
  const artifact = await inspectReleaseArtifact(artifactRoot);
  let provenance;
  let catalogSource;
  try {
    [provenance, catalogSource] = await Promise.all([
      readFile(resolve(artifactRoot, RELEASE_PROVENANCE_FILE), "utf8").then(JSON.parse),
      readFile(resolve(artifactRoot, RELEASE_CATALOG_FILE))
    ]);
  } catch {
    throw new Error("正式制品缺少或无法解析来源清单及目录快照");
  }
  const catalog = JSON.parse(catalogSource.toString("utf8"));
  const catalogManifestSha256 = createHash("sha256").update(catalogSource).digest("hex");

  const validCreatedAt = typeof provenance.createdAt === "string" && Number.isFinite(Date.parse(provenance.createdAt));
  if (provenance.schemaVersion !== 1 || provenance.provenanceType !== "mockup-studio-release" || !validCreatedAt) {
    throw new Error("正式制品来源清单身份无效");
  }
  if (provenance.version !== expected.version || provenance.sourceTag !== `v${expected.version}`) throw new Error("正式制品来源清单版本绑定错误");
  if (provenance.contractId !== expected.contractId) throw new Error("正式制品来源清单合同绑定错误");
  if (!/^[a-f0-9]{64}$/.test(provenance.contractSha256 || "") || provenance.contractSha256 !== expected.contractSha256) throw new Error("正式制品来源清单合同摘要绑定错误");
  if (provenance.sourceRevision !== expected.sourceRevision) throw new Error("正式制品来源清单源提交绑定错误");
  if (provenance.buildFingerprint !== artifact.fingerprint) throw new Error("正式制品来源清单指纹绑定错误");
  if (provenance.artifactSha256 !== artifact.sha256) throw new Error("正式制品来源清单摘要绑定错误");
  if (provenance.measurementPolicySha256 !== expected.measurementPolicySha256) throw new Error("正式制品来源清单政策摘要绑定错误");
  if (!/^\d{4}\.\d{2}\.\d{2}\.\d+$/.test(provenance.catalogVersion || "") || provenance.catalogVersion !== catalog.catalogVersion) throw new Error("正式制品来源清单目录版本绑定错误");
  if (provenance.catalogManifestSha256 !== catalogManifestSha256) throw new Error("正式制品来源清单目录摘要绑定错误");

  return { ...artifact, provenance, catalog, catalogManifestSha256 };
}
