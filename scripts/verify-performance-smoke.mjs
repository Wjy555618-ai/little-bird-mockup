import { createServer } from "node:http";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const chromeCandidates = [
  process.env.MOCKUP_STUDIO_CHROME,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium"
].filter(Boolean);

async function chromePath() {
  for (const candidate of chromeCandidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {}
  }
  throw new Error("500项目录性能烟测必须使用真实 Chrome/Chromium，不能跳过");
}

function listen(server, port) {
  return new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolvePromise(server.address().port));
  });
}

function close(server) {
  return new Promise((resolvePromise) => server.close(() => resolvePromise()));
}

const temporaryRoot = await mkdtemp(resolve(tmpdir(), "mockup-performance-smoke-"));
let server;
let chromeProcess;
try {
  const probe = createServer();
  const port = await listen(probe, 0);
  await close(probe);

  const config = JSON.parse(await readFile(resolve(projectRoot, "config/plugin.config.json"), "utf8"));
  config.environments.development.catalogUrl = `http://localhost:${port}/catalog/testing/v1/manifest.json`;
  const configPath = resolve(temporaryRoot, "plugin.config.json");
  const pluginRoot = resolve(temporaryRoot, "plugin");
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  const build = spawnSync(process.execPath, [
    "scripts/build-plugin.mjs", "--mode", "development", "--config", configPath, "--out-dir", pluginRoot
  ], { cwd: projectRoot, encoding: "utf8" });
  if (build.status !== 0) throw new Error(build.stderr || build.stdout || "性能烟测构建失败");

  const sourceManifest = JSON.parse(await readFile(resolve(projectRoot, "catalog/testing/v1/manifest.json"), "utf8"));
  const sourceItem = sourceManifest.items[0];
  const baseBytes = await readFile(resolve(projectRoot, "catalog/testing/v1", sourceItem.layers.base));
  const thumbnailBytes = await readFile(resolve(projectRoot, "catalog/testing/v1", sourceItem.thumbnail));
  const items = Array.from({ length: 500 }, (_, index) => ({
    ...structuredClone(sourceItem),
    id: `performance-item-${String(index).padStart(3, "0")}`,
    name: `性能样机 ${String(index).padStart(3, "0")}`,
    tags: ["performance", `item-${index}`],
    layers: { base: `fixtures/performance-item-${index}-base-r1.png` },
    thumbnail: `fixtures/performance-item-${index}-thumbnail-r1.png`
  }));
  const manifest = {
    ...sourceManifest,
    catalogVersion: "2026.10.31.999",
    publishedAt: "2026-10-31T02:00:00.000Z",
    items
  };

  const measurementScript = `<script>
    (async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const deadline = performance.now() + 8000;
      while (performance.now() < deadline && document.querySelectorAll('.asset-card').length !== 500) await sleep(10);
      const itemCount = document.querySelectorAll('.asset-card').length;
      const initialRenderMs = performance.now() - window.__PERFORMANCE_SMOKE_START__;
      const search = document.querySelector('#searchInput');
      const samples = [];
      if (itemCount === 500 && search) {
        for (let index = 0; index < 30; index += 1) {
          search.value = index % 2 ? '' : 'item-' + index;
          const startedAt = performance.now();
          search.dispatchEvent(new Event('input', { bubbles: true }));
          samples.push(performance.now() - startedAt);
        }
        search.value = '';
        search.dispatchEvent(new Event('input', { bubbles: true }));
      }
      samples.sort((left, right) => left - right);
      const searchP95Ms = samples[Math.max(0, Math.ceil(samples.length * 0.95) - 1)] ?? Infinity;
      const result = { itemCount, initialRenderMs, searchSampleCount: samples.length, searchP95Ms, finalItemCount: document.querySelectorAll('.asset-card').length };
      await fetch('/performance-result', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result) });
    })().catch((error) => {
      fetch('/performance-result', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: error.message }) });
    });
  </script>`;
  const builtUi = await readFile(resolve(pluginRoot, "ui.html"), "utf8");
  const ui = builtUi
    .replace("<head>", "<head><script>window.__PERFORMANCE_SMOKE_START__=performance.now()</script>")
    .replace("</body>", `${measurementScript}</body>`);

  let resolveMeasurement;
  let rejectMeasurement;
  const measurement = new Promise((resolvePromise, reject) => {
    resolveMeasurement = resolvePromise;
    rejectMeasurement = reject;
  });
  server = createServer(async (request, response) => {
    const url = new URL(request.url || "/", `http://localhost:${port}`);
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Cache-Control", "no-store");
    if (request.method === "POST" && url.pathname === "/performance-result") {
      const chunks = [];
      let total = 0;
      for await (const chunk of request) {
        total += chunk.length;
        if (total > 64 * 1024) {
          rejectMeasurement(new Error("性能结果响应过大"));
          response.writeHead(413);
          response.end();
          return;
        }
        chunks.push(chunk);
      }
      try {
        const result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (result.error) rejectMeasurement(new Error(result.error));
        else resolveMeasurement(result);
        response.writeHead(204);
        response.end();
      } catch (error) {
        rejectMeasurement(error);
        response.writeHead(400);
        response.end();
      }
    } else if (url.pathname === "/preview") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(ui);
    } else if (url.pathname === "/catalog/testing/v1/manifest.json") {
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(manifest));
    } else if (/\/fixtures\/performance-item-\d+-base-r1\.png$/.test(url.pathname)) {
      response.writeHead(200, { "Content-Type": "image/png", "Content-Length": baseBytes.byteLength });
      response.end(baseBytes);
    } else if (/\/fixtures\/performance-item-\d+-thumbnail-r1\.png$/.test(url.pathname)) {
      response.writeHead(200, { "Content-Type": "image/png", "Content-Length": thumbnailBytes.byteLength });
      response.end(thumbnailBytes);
    } else {
      response.writeHead(404);
      response.end("Not Found");
    }
  });
  await listen(server, port);

  const chrome = await chromePath();
  chromeProcess = spawn(chrome, [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--enable-precise-memory-info",
    "--disable-background-networking",
    `--user-data-dir=${resolve(temporaryRoot, "chrome-profile")}`,
    `http://localhost:${port}/preview`
  ], { stdio: ["ignore", "ignore", "ignore"] });
  const chromeExit = new Promise((resolvePromise) => chromeProcess.once("close", resolvePromise));
  const earlyExit = chromeExit.then((status) => { throw new Error(`Chrome 在提交性能结果前退出：${status}`); });
  let timeoutId;
  const timeout = new Promise((_, reject) => { timeoutId = setTimeout(() => reject(new Error("Chrome 性能烟测超过 30000ms")), 30_000); });
  const result = await Promise.race([measurement, earlyExit, timeout]);
  clearTimeout(timeoutId);
  chromeProcess.kill("SIGTERM");
  await chromeExit;
  chromeProcess = null;
  if (result.itemCount !== 500 || result.finalItemCount !== 500) throw new Error(`500项目录渲染不完整：${JSON.stringify(result)}`);
  if (result.searchSampleCount !== 30) throw new Error(`搜索样本不足：${JSON.stringify(result)}`);
  if (result.initialRenderMs > 2500) throw new Error(`本地浏览器500项首屏超过2500ms：${result.initialRenderMs.toFixed(1)}ms`);
  if (result.searchP95Ms > 100) throw new Error(`本地浏览器搜索P95超过100ms：${result.searchP95Ms.toFixed(1)}ms`);
  console.log(`500-item browser smoke PASS: initial ${result.initialRenderMs.toFixed(1)}ms, search P95 ${result.searchP95Ms.toFixed(1)}ms (n=30)`);
  console.log("该结果是本机Chrome开发烟测，不替代正式REL候选在最低支持Figma设备上的G-120证据。");
} finally {
  if (chromeProcess) chromeProcess.kill("SIGKILL");
  if (server) await close(server).catch(() => {});
  await rm(temporaryRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
}
