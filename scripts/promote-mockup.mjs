import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const testingRoot = resolve(projectRoot, "catalog/testing/v1");
const productionRoot = resolve(projectRoot, "catalog/production/v1");
const testingManifestPath = resolve(testingRoot, "manifest.json");
const productionManifestPath = resolve(productionRoot, "manifest.json");
const args = process.argv.slice(2);
const idIndex = args.indexOf("--id");
const requestedId = idIndex >= 0 ? args[idIndex + 1] : null;
const promoteAll = args.includes("--all");

if (!requestedId && !promoteAll) throw new Error("请使用 --id <assetId> 或 --all 指定要发布的样机");

function safePath(root, relativePath) {
  if (typeof relativePath !== "string" || !relativePath || relativePath.startsWith("/") || relativePath.includes("\\")) throw new Error("素材路径无效");
  const path = resolve(root, relativePath);
  if (path !== root && !path.startsWith(`${root}${sep}`)) throw new Error("素材路径越界");
  return path;
}

function itemDigest(item) {
  return createHash("sha256").update(JSON.stringify(item)).digest("hex");
}

function nextVersion(current) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date()).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const prefix = `${parts.year}.${parts.month}.${parts.day}`;
  const currentNumber = current.startsWith(`${prefix}.`) ? Number(current.split(".").at(-1)) || 0 : 0;
  return `${prefix}.${currentNumber + 1}`;
}

async function approvalFor(item) {
  const path = resolve(testingRoot, `approvals/${item.id}-r${item.revision}.json`);
  let approval;
  try { approval = JSON.parse(await readFile(path, "utf8")); }
  catch { throw new Error(`${item.id} 尚未在样机质检台通过`); }
  if (approval.status !== "approved" || approval.assetId !== item.id || approval.revision !== item.revision) throw new Error(`${item.id} 的质检报告无效`);
  if (approval.rendererVersion !== "2.1.0" || approval.itemSha256 !== itemDigest(item)) throw new Error(`${item.id} 的质检报告已过期，请重新验收`);
  return approval;
}

async function copyAssetFile(relativePath) {
  const source = safePath(testingRoot, relativePath);
  const destination = safePath(productionRoot, relativePath);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

const testing = JSON.parse(await readFile(testingManifestPath, "utf8"));
const production = JSON.parse(await readFile(productionManifestPath, "utf8"));
const targets = promoteAll ? testing.items : testing.items.filter((item) => item.id === requestedId);
if (!targets.length) throw new Error(`测试库中找不到样机：${requestedId}`);

for (const item of targets) {
  const approval = await approvalFor(item);
  const paths = new Set([item.thumbnail, ...Object.values(item.layers || {}).filter((value) => typeof value === "string")]);
  await Promise.all([...paths].map(copyAssetFile));
  const published = {
    ...structuredClone(item),
    status: "approved",
    qa: {
      approvedAt: approval.approvedAt,
      rendererVersion: approval.rendererVersion,
      sourceItemSha256: approval.itemSha256,
      report: `approvals/${item.id}-r${item.revision}.json`
    }
  };
  const index = production.items.findIndex((candidate) => candidate.id === item.id);
  if (index >= 0) production.items[index] = published;
  else production.items.push(published);
  const category = testing.categories.find((candidate) => candidate.id === item.category);
  if (category && !production.categories.some((candidate) => candidate.id === category.id)) production.categories.push(category);
  const approvalDestination = resolve(productionRoot, published.qa.report);
  await mkdir(dirname(approvalDestination), { recursive: true });
  await copyFile(resolve(testingRoot, published.qa.report), approvalDestination);
  console.log(`已发布：${item.name} (${item.id})`);
}

production.items.sort((a, b) => testing.items.findIndex((item) => item.id === a.id) - testing.items.findIndex((item) => item.id === b.id));
production.catalogVersion = nextVersion(production.catalogVersion);
production.publishedAt = new Date().toISOString();
await writeFile(productionManifestPath, `${JSON.stringify(production, null, 2)}\n`);
console.log(`正式库版本：${production.catalogVersion}，共 ${production.items.length} 个样机`);
