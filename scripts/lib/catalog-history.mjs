import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { copyFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

const versionPattern = /^\d{4}\.\d{2}\.\d{2}\.\d+$/;

function fail(message) {
  throw new Error(message);
}

function catalogPaths(projectRoot, library) {
  if (!['testing', 'production'].includes(library)) fail("目录环境必须是 testing 或 production");
  return {
    activeRoot: resolve(projectRoot, "catalog", library, "v1"),
    historyRoot: resolve(projectRoot, "catalog-history", library)
  };
}

function safePath(root, relativePath, label) {
  if (typeof relativePath !== "string" || !relativePath || relativePath.startsWith("/") || relativePath.includes("\\") || relativePath.split("/").includes("..")) fail(`${label} 路径无效`);
  const path = resolve(root, relativePath);
  if (path !== root && !path.startsWith(`${root}${sep}`)) fail(`${label} 路径越界`);
  return path;
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function writeSnapshotBytes(historyRoot, manifest, source) {
  if (!versionPattern.test(manifest.catalogVersion || "")) fail("当前目录版本无效，不能建立快照");
  const snapshotPath = resolve(historyRoot, manifest.catalogVersion, "manifest.json");
  const existing = await readFile(snapshotPath).catch((error) => error?.code === "ENOENT" ? null : Promise.reject(error));
  if (existing) {
    if (!existing.equals(source)) fail(`目录快照已存在但内容不同：${manifest.catalogVersion}`);
    return { version: manifest.catalogVersion, snapshotPath, created: false, sha256: digest(source) };
  }
  await mkdir(dirname(snapshotPath), { recursive: true });
  await writeFile(snapshotPath, source, { flag: "wx" });
  return { version: manifest.catalogVersion, snapshotPath, created: true, sha256: digest(source) };
}

export async function atomicWriteJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => {});
  }
}

export async function snapshotCatalog(projectRoot, library = "production") {
  const { activeRoot, historyRoot } = catalogPaths(projectRoot, library);
  const sourcePath = resolve(activeRoot, "manifest.json");
  const source = await readFile(sourcePath);
  const manifest = JSON.parse(source);
  if (!versionPattern.test(manifest.catalogVersion || "") || manifest.environment !== library) fail("当前目录身份无效，不能建立快照");
  return writeSnapshotBytes(historyRoot, manifest, source);
}

export async function snapshotCatalogManifest(projectRoot, library, manifest) {
  const { activeRoot, historyRoot } = catalogPaths(projectRoot, library);
  if (!manifest || manifest.environment !== library) fail("待发布目录身份无效，不能建立快照");
  const source = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  await verifyManifestAssets(activeRoot, manifest);
  return writeSnapshotBytes(historyRoot, manifest, source);
}

export async function copyImmutableFile(sourcePath, destinationPath) {
  const source = await readFile(sourcePath);
  const existing = await readFile(destinationPath).catch((error) => error?.code === "ENOENT" ? null : Promise.reject(error));
  if (existing) {
    if (!existing.equals(source)) fail(`不可变文件已存在但内容不同：${destinationPath}`);
    return { copied: false, sha256: digest(source) };
  }
  await mkdir(dirname(destinationPath), { recursive: true });
  await copyFile(sourcePath, destinationPath, constants.COPYFILE_EXCL);
  return { copied: true, sha256: digest(source) };
}

async function verifyManifestAssets(activeRoot, manifest) {
  for (const item of manifest.items || []) {
    const resources = new Map([
      [item.thumbnail, item.integrity?.thumbnailSha256],
      ...Object.entries(item.layers || {}).map(([name, path]) => [path, item.integrity?.[`${name}Sha256`]])
    ]);
    for (const [relativePath, expectedSha256] of resources) {
      if (!/^[a-f0-9]{64}$/.test(expectedSha256 || "")) fail(`${item.id} 快照缺少素材摘要`);
      const bytes = await readFile(safePath(activeRoot, relativePath, `${item.id} 素材`));
      if (digest(bytes) !== expectedSha256) fail(`${item.id} 快照素材与摘要不一致：${relativePath}`);
    }
  }
}

export async function rollbackCatalog(projectRoot, options) {
  const library = options.library || "production";
  const { activeRoot, historyRoot } = catalogPaths(projectRoot, library);
  if (!versionPattern.test(options.toVersion || "")) fail("--to 必须是 YYYY.MM.DD.N");
  if (!versionPattern.test(options.nextVersion || "")) fail("--version 必须是新的 YYYY.MM.DD.N");
  const current = JSON.parse(await readFile(resolve(activeRoot, "manifest.json"), "utf8"));
  const target = JSON.parse(await readFile(resolve(historyRoot, options.toVersion, "manifest.json"), "utf8"));
  if (target.catalogVersion !== options.toVersion || target.environment !== library || target.schemaVersion !== current.schemaVersion || target.rendererVersion !== current.rendererVersion) fail("回滚快照与当前目录契约不兼容");
  if (current.catalogVersion === options.toVersion) fail("目标已经是当前目录版本");
  if (current.catalogVersion === options.nextVersion || options.toVersion === options.nextVersion) fail("回滚发布版本必须是新的版本号");
  await verifyManifestAssets(activeRoot, target);

  const restored = structuredClone(target);
  restored.catalogVersion = options.nextVersion;
  restored.publishedAt = options.performedAt || new Date().toISOString();
  restored.rollback = {
    fromVersion: current.catalogVersion,
    restoredVersion: options.toVersion,
    performedAt: restored.publishedAt
  };
  if (options.apply === true) {
    await snapshotCatalog(projectRoot, library);
    await snapshotCatalogManifest(projectRoot, library, restored);
    await atomicWriteJson(resolve(activeRoot, "manifest.json"), restored);
  }
  return { currentVersion: current.catalogVersion, restoredVersion: options.toVersion, nextVersion: options.nextVersion, applied: options.apply === true, manifest: restored };
}

export async function verifyCatalogHistory(projectRoot, library = "production") {
  const { activeRoot, historyRoot } = catalogPaths(projectRoot, library);
  const activeBytes = await readFile(resolve(activeRoot, "manifest.json"));
  const current = JSON.parse(activeBytes);
  const snapshotPath = resolve(historyRoot, current.catalogVersion, "manifest.json");
  const snapshotBytes = await readFile(snapshotPath);
  const snapshot = JSON.parse(snapshotBytes);
  if (!snapshotBytes.equals(activeBytes)) fail(`当前目录 ${current.catalogVersion} 没有逐字一致的回滚快照`);
  await verifyManifestAssets(activeRoot, snapshot);
  return { version: current.catalogVersion, snapshotPath };
}
