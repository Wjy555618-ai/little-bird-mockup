import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const catalogRoot = resolve(projectRoot, "catalog");
const testingRoot = resolve(catalogRoot, "testing/v1");
const testingManifestPath = resolve(testingRoot, "manifest.json");
const pluginPreview = resolve(projectRoot, "plugin/ui.html");
const labRoot = resolve(projectRoot, "asset-lab");
const sharedRoot = resolve(projectRoot, "shared");
const port = Number(process.env.MOCKUP_CATALOG_PORT || 4173);
const host = "127.0.0.1";

const REQUIRED_PATTERNS = ["grid", "landscape", "portrait", "edge"];
const MANUAL_KEYS = ["frameFit", "perspective", "edgeMask", "imageQuality", "allPatterns"];
const AUTOMATIC_KEYS = ["schema", "renderer", "dimensions", "recommendedSize", "geometry", "provenance", "integrity"];

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".glb": "model/gltf-binary"
};

function json(response, status, value) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(`${JSON.stringify(value)}\n`);
}

function safePath(root, relativePath) {
  const filePath = resolve(root, relativePath || "");
  if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) throw new Error("路径越界");
  return filePath;
}

async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

function itemDigest(item) {
  return createHash("sha256").update(JSON.stringify(item)).digest("hex");
}

function assertQuad(item, quad) {
  if (!Array.isArray(quad) || quad.length !== 4) throw new Error("屏幕必须有四个顶点");
  for (const point of quad) {
    if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)) throw new Error("屏幕顶点无效");
    if (point[0] < 0 || point[0] > item.canvas.width || point[1] < 0 || point[1] > item.canvas.height) throw new Error("屏幕顶点超出画布");
  }
  const area = Math.abs(quad.reduce((sum, point, index) => {
    const next = quad[(index + 1) % quad.length];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0) / 2);
  if (area < item.canvas.width * item.canvas.height * 0.005) throw new Error("屏幕区域过小或顶点顺序错误");
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 256 * 1024) throw new Error("请求体过大");
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); }
  catch { throw new Error("JSON 请求体无效"); }
}

async function verifyItem(manifest, item) {
  if (manifest.schemaVersion !== 2 || manifest.rendererVersion !== "2.1.0") throw new Error("测试库规范或渲染器版本不匹配");
  if (!item || item.status !== "testing" || item.renderer !== "static-screen-v2") throw new Error("素材不是可质检的静态样机");
  if (!Number.isInteger(item.canvas?.width) || !Number.isInteger(item.canvas?.height)) throw new Error("画布尺寸无效");
  if (!Number.isInteger(item.screen?.recommendedSize?.width) || !Number.isInteger(item.screen?.recommendedSize?.height) || !item.screen.recommendedSize.label) throw new Error("推荐画面尺寸无效");
  assertQuad(item, item.screen?.quad);
  if (item.provenance?.kind !== "generated-in-house") throw new Error("素材来源未标记为项目自制");
  const basePath = safePath(testingRoot, item.layers?.base);
  const thumbnailPath = safePath(testingRoot, item.thumbnail);
  const [baseDigest, thumbnailDigest] = await Promise.all([sha256(basePath), sha256(thumbnailPath)]);
  if (baseDigest !== item.integrity?.baseSha256 || thumbnailDigest !== item.integrity?.thumbnailSha256) throw new Error("素材哈希与清单不匹配");
}

async function serveFile(request, response, filePath) {
  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("Not a file");
    const data = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": contentTypes[extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    if (request.method === "HEAD") response.end();
    else response.end(data);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not Found");
  }
}

async function currentApprovals() {
  const manifest = JSON.parse(await readFile(testingManifestPath, "utf8"));
  const approvalsRoot = resolve(testingRoot, "approvals");
  await mkdir(approvalsRoot, { recursive: true });
  const files = (await readdir(approvalsRoot)).filter((name) => name.endsWith(".json"));
  const approvals = [];
  for (const name of files) {
    try {
      const approval = JSON.parse(await readFile(resolve(approvalsRoot, name), "utf8"));
      const item = manifest.items.find((candidate) => candidate.id === approval.assetId && candidate.revision === approval.revision);
      approvals.push({ ...approval, current: Boolean(item && approval.itemSha256 === itemDigest(item)) });
    } catch { /* Ignore an unreadable local report. */ }
  }
  return approvals;
}

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/lab/approvals") {
    json(response, 200, { approvals: await currentApprovals() });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/lab/geometry") {
    const body = await readBody(request);
    const manifest = JSON.parse(await readFile(testingManifestPath, "utf8"));
    const item = manifest.items.find((candidate) => candidate.id === body.assetId);
    if (!item) throw new Error("找不到待检样机");
    assertQuad(item, body.quad);
    const cornerRadius = Number(body.cornerRadius);
    if (!Number.isFinite(cornerRadius) || cornerRadius < 0 || cornerRadius > 0.49) throw new Error("圆角比例无效");
    item.screen.quad = body.quad.map(([x, y]) => [Math.round(x), Math.round(y)]);
    item.screen.cornerRadius = cornerRadius;
    manifest.publishedAt = new Date().toISOString();
    await writeFile(testingManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    json(response, 200, { ok: true, item });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/lab/approve") {
    const body = await readBody(request);
    const manifest = JSON.parse(await readFile(testingManifestPath, "utf8"));
    const item = manifest.items.find((candidate) => candidate.id === body.assetId);
    if (!item) throw new Error("找不到待检样机");
    await verifyItem(manifest, item);
    if (JSON.stringify(body.quad) !== JSON.stringify(item.screen.quad)) throw new Error("当前坐标尚未保存到测试库");
    if (!AUTOMATIC_KEYS.every((key) => body.automaticChecks?.[key] === true)) throw new Error("自动检查尚未全部通过");
    if (!MANUAL_KEYS.every((key) => body.manualChecks?.[key] === true)) throw new Error("人工验收尚未全部确认");
    if (!REQUIRED_PATTERNS.every((id) => body.patternIds?.includes(id))) throw new Error("四种测试图尚未全部查看");
    const report = {
      schemaVersion: 1,
      assetId: item.id,
      revision: item.revision,
      status: "approved",
      rendererVersion: manifest.rendererVersion,
      itemSha256: itemDigest(item),
      approvedAt: new Date().toISOString(),
      patternIds: REQUIRED_PATTERNS,
      automaticChecks: Object.fromEntries(AUTOMATIC_KEYS.map((key) => [key, true])),
      manualChecks: Object.fromEntries(MANUAL_KEYS.map((key) => [key, true]))
    };
    const approvalPath = resolve(testingRoot, `approvals/${item.id}-r${item.revision}.json`);
    await mkdir(resolve(testingRoot, "approvals"), { recursive: true });
    await writeFile(approvalPath, `${JSON.stringify(report, null, 2)}\n`);
    json(response, 200, { ok: true, report });
    return true;
  }

  return false;
}

createServer(async (request, response) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  const url = new URL(request.url || "/", `http://${request.headers.host || `${host}:${port}`}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      if (!await handleApi(request, response, url)) json(response, 404, { error: "API Not Found" });
      return;
    }
    if (!["GET", "HEAD"].includes(request.method || "")) {
      response.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Method Not Allowed");
      return;
    }
    if (url.pathname === "/preview" || url.pathname === "/preview/") {
      await serveFile(request, response, pluginPreview);
      return;
    }
    if (url.pathname === "/lab" || url.pathname === "/lab/") {
      await serveFile(request, response, resolve(labRoot, "index.html"));
      return;
    }
    if (url.pathname.startsWith("/asset-lab/")) {
      await serveFile(request, response, safePath(labRoot, decodeURIComponent(url.pathname.slice("/asset-lab/".length))));
      return;
    }
    if (url.pathname.startsWith("/shared/")) {
      await serveFile(request, response, safePath(sharedRoot, decodeURIComponent(url.pathname.slice("/shared/".length))));
      return;
    }
    if (url.pathname.startsWith("/catalog/")) {
      await serveFile(request, response, safePath(catalogRoot, decodeURIComponent(url.pathname.slice("/catalog/".length))));
      return;
    }
    response.writeHead(302, { Location: "/lab" });
    response.end();
  } catch (error) {
    json(response, 400, { error: error instanceof Error ? error.message : "请求处理失败" });
  }
}).listen(port, host, () => {
  console.log(`样机质检台: http://${host}:${port}/lab`);
  console.log(`插件预览: http://${host}:${port}/preview`);
  console.log(`测试库: http://${host}:${port}/catalog/testing/v1/manifest.json`);
});

