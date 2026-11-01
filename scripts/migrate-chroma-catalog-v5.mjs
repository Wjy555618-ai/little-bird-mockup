import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { atomicWriteJson, snapshotCatalog } from "./lib/catalog-history.mjs";
import { analyzeCompleteBase, assertCompleteBaseMetrics, assertNoChromaSchema } from "./lib/no-chroma.mjs";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const testingRoot = resolve(projectRoot, "catalog/testing/v1");
const productionRoot = resolve(projectRoot, "catalog/production/v1");
const testingManifestPath = resolve(testingRoot, "manifest.json");
const productionManifestPath = resolve(productionRoot, "manifest.json");
const workflowPath = resolve(projectRoot, "catalog/workflow/state.json");
const checkOnly = process.argv.includes("--check");

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function itemDigest(item) {
  return digest(Buffer.from(JSON.stringify(item)));
}

function points(quad) {
  return quad.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
}

function screenCoverQuad(quad, pixels = 3) {
  const center = quad.reduce((sum, [x, y]) => [sum[0] + x / quad.length, sum[1] + y / quad.length], [0, 0]);
  return quad.map(([x, y]) => {
    const dx = x - center[0];
    const dy = y - center[1];
    const distance = Math.max(1, Math.hypot(dx, dy));
    const scale = (distance + pixels) / distance;
    return [center[0] + dx * scale, center[1] + dy * scale];
  });
}

function neutralScreenSvg(item) {
  const quad = screenCoverQuad(item.screen.aperture.quad);
  const occlusions = (item.screen.occlusions || []).map((shape) => shape.type === "circle"
    ? `<circle cx="${shape.cx}" cy="${shape.cy}" r="${shape.radius}" fill="${shape.fill || "#080808"}"/>`
    : "").join("");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${item.canvas.width}" height="${item.canvas.height}" viewBox="0 0 ${item.canvas.width} ${item.canvas.height}">
    <defs>
      <linearGradient id="screen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#121419"/><stop offset="1" stop-color="#050607"/></linearGradient>
    </defs>
    <polygon points="${points(quad)}" fill="url(#screen)"/>${occlusions}
  </svg>`);
}

async function immutableWrite(path, bytes) {
  const existing = await readFile(path).catch((error) => error?.code === "ENOENT" ? null : Promise.reject(error));
  if (existing) {
    if (!existing.equals(bytes)) throw new Error(`不可变迁移文件已存在但内容不同：${path}`);
    return false;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes, { flag: "wx" });
  return true;
}

async function verifyV5(manifest, root) {
  if (manifest.schemaVersion !== 5 || manifest.rendererVersion !== "2.4.0") throw new Error(`${manifest.environment} 目录尚未迁移到 v5`);
  for (const item of manifest.items) {
    assertNoChromaSchema(item);
    const migratedRevision = item.provenance?.migrationFrom?.revision;
    if (Number.isInteger(migratedRevision) && item.revision <= migratedRevision) throw new Error(`${item.id} 未高于旧迁移 revision`);
    if (!new RegExp(`-r${item.revision}\\.(?:png|jpe?g|webp)$`, "i").test(item.layers.base)) throw new Error(`${item.id} 底图文件名未绑定当前 revision`);
    const basePath = resolve(root, item.layers.base);
    const bytes = await readFile(basePath);
    if (digest(bytes) !== item.integrity.baseSha256) throw new Error(`${item.id} v5 底图摘要不一致`);
    assertCompleteBaseMetrics(item, await analyzeCompleteBase(bytes, item));
  }
}

const [testing, production, previousState] = await Promise.all([
  readFile(testingManifestPath, "utf8").then(JSON.parse),
  readFile(productionManifestPath, "utf8").then(JSON.parse),
  readFile(workflowPath, "utf8").then(JSON.parse)
]);

if (testing.schemaVersion === 5) {
  await verifyV5(testing, testingRoot);
  await verifyV5(production, productionRoot);
  await Promise.all([snapshotCatalog(projectRoot, "testing"), snapshotCatalog(projectRoot, "production")]);
  console.log(`zero-chroma migration OK: testing=${testing.items.length}, production=${production.items.length}`);
  process.exit(0);
}
if (checkOnly) throw new Error("零绿幕 v5 迁移尚未执行");
if (testing.schemaVersion !== 4 || production.schemaVersion !== 4) throw new Error("只允许从现有 v4 目录迁移");
if (testing.items.length !== 5) throw new Error("迁移必须同时覆盖五个活动样机");

await Promise.all([snapshotCatalog(projectRoot, "testing"), snapshotCatalog(projectRoot, "production")]);
const createdPaths = [];
try {
  const nextItems = [];
  for (const legacy of testing.items) {
    const sourceBytes = await readFile(resolve(testingRoot, legacy.layers.base));
    const neutralScene = await sharp(sourceBytes, { failOn: "error" }).grayscale().modulate({ brightness: 0.82 }).png().toBuffer();
    const baseBytes = await sharp(neutralScene).composite([{ input: neutralScreenSvg(legacy) }]).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
    const basePath = `assets/${legacy.id}-r2.png`;
    const thumbnailPath = `thumbnails/${legacy.id}-r2.png`;
    const thumbnailBytes = await sharp(baseBytes).resize(520, 390, { fit: "contain", background: { r: 24, g: 24, b: 24, alpha: 1 }, withoutEnlargement: true }).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
    const item = structuredClone(legacy);
    item.revision = 2;
    item.status = "testing";
    item.renderer = "static-screen-v5";
    delete item.chromaKey;
    delete item.qa;
    delete item.release;
    item.screen.compositing = { mode: "aperture-mask" };
    item.screen.presentation = { mode: "neutral-off" };
    delete item.screen.underlap;
    delete item.screen.bleed;
    item.layers.base = basePath;
    item.thumbnail = thumbnailPath;
    item.provenance = {
      ...item.provenance,
      kind: "generated-in-house",
      usage: "candidate",
      pipelinePolicyId: "MOCKUP-ASSET-PIPELINE-1",
      presentationState: "complete",
      migrationFrom: { revision: legacy.revision, baseSha256: legacy.integrity.baseSha256 },
      generationNote: "Existing project-made scene neutralized with a non-keyed, device-off screen. No generated or reference-unbound interface content is baked into the asset."
    };
    item.integrity = { baseSha256: digest(baseBytes), thumbnailSha256: digest(thumbnailBytes) };
    assertCompleteBaseMetrics(item, await analyzeCompleteBase(baseBytes, item));
    const absoluteBasePath = resolve(testingRoot, basePath);
    const absoluteThumbnailPath = resolve(testingRoot, thumbnailPath);
    if (await immutableWrite(absoluteBasePath, baseBytes)) createdPaths.push(absoluteBasePath);
    if (await immutableWrite(absoluteThumbnailPath, thumbnailBytes)) createdPaths.push(absoluteThumbnailPath);
    nextItems.push(item);
  }

  const now = new Date().toISOString();
  const nextTesting = { ...testing, schemaVersion: 5, rendererVersion: "2.4.0", catalogVersion: "2026.10.31.2", publishedAt: now, items: nextItems };
  const nextProduction = { ...production, schemaVersion: 5, rendererVersion: "2.4.0", catalogVersion: "2026.10.31.3", publishedAt: now, items: [] };
  const nextState = { schemaVersion: 2, policyId: "MOCKUP-ASSET-PIPELINE-1", workflowRevision: 4, updatedAt: now, requests: {}, assets: {} };
  for (const item of nextItems) {
    const oldEntry = previousState.assets?.[item.id];
    const reference = oldEntry?.reference || {
      sourceMode: "existing-generated-in-house",
      path: `catalog/testing/v1/assets/${item.id}-r1.png`,
      sha256: item.provenance.migrationFrom.baseSha256,
      rightsMode: null
    };
    nextState.assets[item.id] = {
      assetId: item.id,
      revision: 2,
      policyId: "MOCKUP-ASSET-PIPELINE-1",
      state: "TESTING",
      reference,
      candidate: { basePath: item.layers.base, baseSha256: item.integrity.baseSha256, thumbnailPath: item.thumbnail, thumbnailSha256: item.integrity.thumbnailSha256 },
      itemSha256: itemDigest(item),
      qa: null,
      releaseApproval: null,
      blockedReasons: [],
      nextAction: "在样机质检台完成十项自动检查、四种测试图和五项人工检查",
      history: [
        { state: "REFERENCE_RECORDED", reason: "旧项目自制素材及其来源摘要已冻结为迁移输入", actor: "system", at: now },
        { state: "CANDIDATE_READY", reason: "已生成完整无绿幕 r2 候选；旧 r1 批准不再有效", actor: "Codex", at: now },
        { state: "TESTING", reason: "工作流修订版 4 删除人工前置视觉批准，候选直接进入技术质检", actor: "system-migration-v4", at: now }
      ]
    };
  }
  await atomicWriteJson(testingManifestPath, nextTesting);
  await atomicWriteJson(productionManifestPath, nextProduction);
  await atomicWriteJson(workflowPath, nextState);
  await Promise.all([verifyV5(nextTesting, testingRoot), verifyV5(nextProduction, productionRoot)]);
  await Promise.all([snapshotCatalog(projectRoot, "testing"), snapshotCatalog(projectRoot, "production")]);
  console.log(`zero-chroma migration complete: testing=${nextTesting.items.length}, production=${nextProduction.items.length}`);
} catch (error) {
  await Promise.all(createdPaths.map((path) => rm(path, { force: true })));
  throw error;
}
