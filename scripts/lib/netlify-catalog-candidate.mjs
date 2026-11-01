import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

export const NETLIFY_HEADERS = `/*
  Access-Control-Allow-Origin: *
  Access-Control-Allow-Methods: GET, HEAD, OPTIONS
  Access-Control-Allow-Headers: Content-Type
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  X-Robots-Tag: noindex

/v1/manifest.json
  Content-Type: application/json; charset=utf-8
  Cache-Control: no-store, max-age=0, must-revalidate

/v1/assets/*
  Cache-Control: public, max-age=31536000, immutable

/v1/thumbnails/*
  Cache-Control: public, max-age=31536000, immutable
`;

function fail(message) {
  throw new Error(message);
}

function safeRelativePath(value, label) {
  if (typeof value !== "string" || !value || value.startsWith("/") || value.includes("\\") || value.includes("?") || value.includes("#") || value.split("/").includes("..") || /^[a-z][a-z0-9+.-]*:/i.test(value)) {
    fail(`${label} 必须是安全的目录内相对路径`);
  }
  return value;
}

function inside(root, relativePath, label) {
  const target = resolve(root, safeRelativePath(relativePath, label));
  if (target !== root && !target.startsWith(`${root}${sep}`)) fail(`${label} 路径越界`);
  return target;
}

async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function listFiles(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(current, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(root, path));
    else if (entry.isFile()) files.push(path.slice(root.length + 1).split(sep).join("/"));
    else fail(`发布候选包含非常规文件：${entry.name}`);
  }
  return files.sort();
}

export function activeRuntimeFiles(manifest) {
  if (manifest?.schemaVersion !== 5 || manifest.environment !== "production" || !Array.isArray(manifest.items) || manifest.items.length < 1) {
    fail("只允许从有效 production schema v5 manifest 创建候选");
  }
  const files = new Set(["v1/manifest.json"]);
  for (const item of manifest.items) {
    if (item.status !== "approved" || !Number.isInteger(item.revision) || item.revision < 1) fail(`${item.id || "unknown"} 不是有效正式样机`);
    for (const [layerName, relativePath] of Object.entries(item.layers || {})) {
      const safePath = safeRelativePath(relativePath, `${item.id}/${layerName}`);
      if (!new RegExp(`-r${item.revision}\\.[a-z0-9]+$`, "i").test(safePath)) fail(`${item.id}/${layerName} 不是当前 revision 文件`);
      files.add(`v1/${safePath}`);
    }
    const thumbnail = safeRelativePath(item.thumbnail, `${item.id}/thumbnail`);
    if (!new RegExp(`-r${item.revision}\\.[a-z0-9]+$`, "i").test(thumbnail)) fail(`${item.id}/thumbnail 不是当前 revision 文件`);
    files.add(`v1/${thumbnail}`);
  }
  return [...files].sort();
}

export async function prepareNetlifyCatalogCandidate({ projectRoot, outputRoot }) {
  const productionRoot = resolve(projectRoot, "catalog/production");
  const manifestPath = resolve(productionRoot, "v1/manifest.json");
  const manifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const runtimeFiles = activeRuntimeFiles(manifest);

  for (const item of manifest.items) {
    for (const [layerName, relativePath] of Object.entries(item.layers || {})) {
      const digest = await sha256(inside(resolve(productionRoot, "v1"), relativePath, `${item.id}/${layerName}`));
      if (item.integrity?.[`${layerName}Sha256`] !== digest) fail(`${item.id}/${layerName} 摘要漂移`);
    }
    const thumbnailDigest = await sha256(inside(resolve(productionRoot, "v1"), item.thumbnail, `${item.id}/thumbnail`));
    if (item.integrity?.thumbnailSha256 !== thumbnailDigest) fail(`${item.id}/thumbnail 摘要漂移`);
  }

  await mkdir(dirname(outputRoot), { recursive: true });
  const stagingRoot = await mkdtemp(resolve(dirname(outputRoot), ".netlify-catalog-candidate-"));
  try {
    for (const relativePath of runtimeFiles) {
      const sourcePath = inside(productionRoot, relativePath, "候选来源");
      const destinationPath = inside(stagingRoot, relativePath, "候选目标");
      await mkdir(dirname(destinationPath), { recursive: true });
      await copyFile(sourcePath, destinationPath);
    }
    await writeFile(resolve(stagingRoot, "_headers"), NETLIFY_HEADERS, { flag: "wx" });

    const expectedFiles = [...runtimeFiles, "_headers"].sort();
    const actualFiles = await listFiles(stagingRoot);
    if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) fail("发布候选文件白名单漂移");
    if (actualFiles.some((path) => path.includes("approvals/") || path.includes("testing/") || path.includes("workflow/") || path.endsWith(".js") || path.endsWith(".html"))) {
      fail("发布候选包含控制平面、源码或网页文件");
    }

    const digest = createHash("sha256");
    for (const relativePath of actualFiles) {
      const bytes = await readFile(resolve(stagingRoot, relativePath));
      digest.update(`${relativePath}\0${bytes.length}\0`);
      digest.update(bytes);
    }
    const candidateSha256 = digest.digest("hex");
    await rm(outputRoot, { recursive: true, force: true });
    await rename(stagingRoot, outputRoot);
    return {
      schemaVersion: 1,
      catalogVersion: manifest.catalogVersion,
      itemCount: manifest.items.length,
      manifestSha256: createHash("sha256").update(manifestBytes).digest("hex"),
      candidateSha256,
      fileCount: actualFiles.length,
      files: actualFiles
    };
  } catch (error) {
    await rm(stagingRoot, { recursive: true, force: true });
    throw error;
  }
}

export async function verifyNetlifyCatalogCandidate({ projectRoot, outputRoot }) {
  const productionRoot = resolve(projectRoot, "catalog/production");
  const manifest = JSON.parse(await readFile(resolve(productionRoot, "v1/manifest.json"), "utf8"));
  const expectedFiles = [...activeRuntimeFiles(manifest), "_headers"].sort();
  if (!(await stat(outputRoot).catch(() => null))?.isDirectory()) fail("Netlify 发布候选不存在");
  const actualFiles = await listFiles(outputRoot);
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) fail("Netlify 发布候选与当前活动正式目录不一致");
  if (await readFile(resolve(outputRoot, "_headers"), "utf8") !== NETLIFY_HEADERS) fail("Netlify 响应头合同漂移");
  for (const relativePath of expectedFiles.filter((path) => path !== "_headers")) {
    if (await sha256(resolve(outputRoot, relativePath)) !== await sha256(resolve(productionRoot, relativePath))) fail(`候选字节漂移：${relativePath}`);
  }
  return { catalogVersion: manifest.catalogVersion, itemCount: manifest.items.length, files: actualFiles };
}
