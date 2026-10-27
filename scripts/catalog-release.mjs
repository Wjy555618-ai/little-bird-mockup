import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const catalogRoot = resolve(projectRoot, "catalog/v1");
const manifestPath = resolve(catalogRoot, "manifest.json");
const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const versionIndex = args.indexOf("--version");
const nextVersion = versionIndex >= 0 ? args[versionIndex + 1] : null;
const versionPattern = /^\d{4}\.\d{2}\.\d{2}\.\d+$/;

function fail(message) {
  throw new Error(message);
}

function safeCatalogPath(relativePath, label) {
  if (typeof relativePath !== "string" || !relativePath || relativePath.startsWith("/") || relativePath.includes("\\")) {
    fail(`${label} 必须是素材目录内的相对路径`);
  }
  const absolutePath = resolve(catalogRoot, relativePath);
  if (absolutePath !== catalogRoot && !absolutePath.startsWith(`${catalogRoot}${sep}`)) {
    fail(`${label} 越出素材目录`);
  }
  return absolutePath;
}

function assertQuad(item) {
  const quad = item.screen?.quad;
  if (!Array.isArray(quad) || quad.length !== 4) fail(`${item.id} 必须有 4 个屏幕顶点`);
  for (const point of quad) {
    if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)) fail(`${item.id} 存在无效屏幕顶点`);
    if (point[0] < 0 || point[0] > item.canvas.width || point[1] < 0 || point[1] > item.canvas.height) {
      fail(`${item.id} 的屏幕顶点超出画布`);
    }
  }
  const area = Math.abs(quad.reduce((sum, point, index) => {
    const next = quad[(index + 1) % quad.length];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0) / 2);
  if (area < item.canvas.width * item.canvas.height * 0.005) fail(`${item.id} 的屏幕区域过小或顶点顺序错误`);
}

async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (manifest.schemaVersion !== 1) fail("只支持 schemaVersion 1");
if (!versionPattern.test(manifest.catalogVersion)) fail("当前 catalogVersion 格式无效");
if (!Number.isFinite(Date.parse(manifest.publishedAt))) fail("publishedAt 不是有效时间");
if (!Array.isArray(manifest.categories) || !Array.isArray(manifest.items)) fail("清单缺少 categories 或 items");

const categoryIds = new Set();
for (const category of manifest.categories) {
  if (!category.id || !category.label || categoryIds.has(category.id)) fail(`分类无效或重复：${category.id || "unknown"}`);
  categoryIds.add(category.id);
}

const itemIds = new Set();
for (const item of manifest.items) {
  if (!item.id || itemIds.has(item.id)) fail(`样机 id 无效或重复：${item.id || "unknown"}`);
  itemIds.add(item.id);
  if (!Number.isInteger(item.revision) || item.revision < 1) fail(`${item.id} revision 必须是正整数`);
  if (!item.name || !categoryIds.has(item.category)) fail(`${item.id} 的名称或分类无效`);
  if (item.renderer !== "static-screen-v1") fail(`${item.id} 使用了未支持的渲染器`);
  if (!Number.isInteger(item.canvas?.width) || !Number.isInteger(item.canvas?.height) || item.canvas.width < 1 || item.canvas.height < 1) {
    fail(`${item.id} 画布尺寸无效`);
  }
  if (!["cover", "contain", "stretch"].includes(item.screen?.defaultFit || "cover")) fail(`${item.id} defaultFit 无效`);
  assertQuad(item);

  const basePath = safeCatalogPath(item.layers?.base, `${item.id} base`);
  const thumbnailPath = safeCatalogPath(item.thumbnail, `${item.id} thumbnail`);
  if (!new RegExp(`-r${item.revision}\\.[a-z0-9]+$`, "i").test(item.layers.base)) fail(`${item.id} base 文件名必须包含当前 revision`);
  if (!new RegExp(`-r${item.revision}\\.[a-z0-9]+$`, "i").test(item.thumbnail)) fail(`${item.id} thumbnail 文件名必须包含当前 revision`);

  const [baseSha256, thumbnailSha256] = await Promise.all([sha256(basePath), sha256(thumbnailPath)]);
  item.integrity ||= {};
  if (checkOnly) {
    if (item.integrity.baseSha256 !== baseSha256) fail(`${item.id} baseSha256 与文件不匹配`);
    if (item.integrity.thumbnailSha256 !== thumbnailSha256) fail(`${item.id} thumbnailSha256 与文件不匹配`);
  } else {
    item.integrity.baseSha256 = baseSha256;
    item.integrity.thumbnailSha256 = thumbnailSha256;
  }
}

if (checkOnly) {
  console.log(`Catalog OK: ${manifest.items.length} 个样机，版本 ${manifest.catalogVersion}`);
} else {
  if (!nextVersion || !versionPattern.test(nextVersion)) {
    fail("发布必须显式传入 --version YYYY.MM.DD.N");
  }
  if (nextVersion === manifest.catalogVersion) fail("新 catalogVersion 不能与当前版本相同");
  manifest.catalogVersion = nextVersion;
  manifest.publishedAt = new Date().toISOString();
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Catalog released locally: ${manifest.items.length} 个样机，版本 ${nextVersion}`);
  console.log("下一步：运行 npm run check，再原子部署 catalog/ 目录。");
}
