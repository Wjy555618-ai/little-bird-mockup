import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeCompleteBase, assertCompleteBaseMetrics, assertNoChromaSchema } from "./lib/no-chroma.mjs";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const runtimeFiles = [
  "shared/mockup-renderer.js",
  "asset-lab/app.js",
  "scripts/catalog-release.mjs",
  "scripts/serve-catalog.mjs",
  "scripts/lib/asset-pipeline.mjs"
];
const forbiddenRuntimePatterns = [
  ["chroma-edge", /["']chroma-edge["']/],
  ["chromaAlpha", /\bchromaAlpha\b/],
  ["chromaSpillAlpha", /\bchromaSpillAlpha\b/],
  ["screenCoverageMask", /\bscreenCoverageMask\b/],
  ["screenCoverageMetrics", /\bscreenCoverageMetrics\b/],
  ["preparedBaseImage", /\bpreparedBaseImage\b/]
];

for (const relativePath of runtimeFiles) {
  const source = await readFile(resolve(projectRoot, relativePath), "utf8");
  for (const [label, pattern] of forbiddenRuntimePatterns) {
    if (pattern.test(source)) throw new Error(`${relativePath} 仍包含已禁用的色键运行时：${label}`);
  }
}

const serverSource = await readFile(resolve(projectRoot, "scripts/serve-catalog.mjs"), "utf8");
if (!/catalogPathIsActive/.test(serverSource)) throw new Error("本地素材服务未限制为活动清单引用文件");

let checked = 0;
for (const library of ["testing", "production"]) {
  const root = resolve(projectRoot, `catalog/${library}/v1`);
  const manifest = JSON.parse(await readFile(resolve(root, "manifest.json"), "utf8"));
  if (manifest.schemaVersion !== 5 || manifest.rendererVersion !== "2.4.0") throw new Error(`${library} 目录不是零绿幕 v5`);
  for (const item of manifest.items) {
    assertNoChromaSchema(item);
    const migratedRevision = item.provenance?.migrationFrom?.revision;
    if (Number.isInteger(migratedRevision) && item.revision <= migratedRevision) throw new Error(`${library}/${item.id} 未高于旧迁移 revision`);
    if (!new RegExp(`-r${item.revision}\\.(?:png|jpe?g|webp)$`, "i").test(item.layers.base) || !new RegExp(`-r${item.revision}\\.(?:png|jpe?g|webp)$`, "i").test(item.thumbnail)) throw new Error(`${library}/${item.id} 文件名未绑定当前 revision`);
    const metrics = await analyzeCompleteBase(resolve(root, item.layers.base), item);
    if (library === "testing") {
      assertCompleteBaseMetrics(item, metrics, null, { allowPendingFinalDecision: true });
    } else {
      const confirmation = !metrics.pass && item.release?.report
        ? JSON.parse(await readFile(resolve(root, item.release.report), "utf8"))
        : null;
      assertCompleteBaseMetrics(item, metrics, confirmation);
    }
    checked += 1;
  }
}

console.log(`zero-chroma gate OK: ${checked} 个活动样机，schema=5，renderer=2.4.0`);
