import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const chrome = process.env.MOCKUP_CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const environments = ["testing", "production"];
const width = 520;
const height = 390;

function safePath(pathname) {
  const absolute = resolve(projectRoot, `.${pathname}`);
  if (absolute !== projectRoot && !absolute.startsWith(`${projectRoot}${sep}`)) throw new Error("路径越出项目目录");
  return absolute;
}

function contentType(pathname) {
  return ({ ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".html": "text/html" })[extname(pathname)] || "application/octet-stream";
}

function thumbnailPage(environment, assetId) {
  return `<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{width:${width}px;height:${height}px;margin:0;overflow:hidden;background:#181818}canvas{display:block;width:${width}px;height:${height}px}</style><canvas id="output" width="${width}" height="${height}"></canvas><script src="/shared/mockup-renderer.js"></script><script>
  const environment=${JSON.stringify(environment)};
  const assetId=${JSON.stringify(assetId)};
  const loadImage=(url)=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=url});
  (async()=>{
    const response=await fetch('/catalog/'+environment+'/v1/manifest.json');
    const manifest=await response.json();
    const asset=manifest.items.find((item)=>item.id===assetId);
    const baseImage=await loadImage('/catalog/'+environment+'/v1/'+asset.layers.base);
    const composite=document.createElement('canvas');
    composite.width=asset.canvas.width;
    composite.height=asset.canvas.height;
    window.MockupRenderer.renderComposite({canvas:composite,asset,baseImage,designImage:null,fit:'cover',adjustments:window.MockupRenderer.DEFAULT_ADJUSTMENTS,quad:asset.screen.quad});
    const output=document.getElementById('output');const context=output.getContext('2d');
    context.fillStyle='#181818';context.fillRect(0,0,output.width,output.height);
    const scale=Math.min(output.width/composite.width,output.height/composite.height);
    const drawWidth=composite.width*scale;const drawHeight=composite.height*scale;
    context.drawImage(composite,(output.width-drawWidth)/2,(output.height-drawHeight)/2,drawWidth,drawHeight);
    document.body.dataset.ready='true';
  })().catch((error)=>{document.body.dataset.error=error.message});
  </script>`;
}

function runChrome(url, outputPath) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(chrome, [
      "--headless=new",
      "--hide-scrollbars",
      "--disable-gpu",
      "--force-device-scale-factor=1",
      `--window-size=${width},${height}`,
      "--virtual-time-budget=4000",
      `--screenshot=${outputPath}`,
      url
    ], { stdio: ["ignore", "pipe", "pipe"] });
    let error = "";
    child.stderr.on("data", (chunk) => { error += chunk; });
    child.on("error", rejectRun);
    child.on("exit", (code) => code === 0 ? resolveRun() : rejectRun(new Error(error || `Chrome 退出码 ${code}`)));
  });
}

const server = createServer((request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  if (url.pathname === "/__thumbnail__") {
    response.writeHead(200, { "content-type": "text/html", "cache-control": "no-store" });
    response.end(thumbnailPage(url.searchParams.get("environment"), url.searchParams.get("id")));
    return;
  }
  try {
    const path = safePath(url.pathname);
    readFile(path).then((body) => {
      response.writeHead(200, { "content-type": contentType(path), "cache-control": "no-store" });
      response.end(body);
    }).catch(() => { response.writeHead(404); response.end(); });
  } catch {
    response.writeHead(404); response.end();
  }
});

await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
const { port } = server.address();

try {
  const manifests = {};
  for (const environment of environments) {
    const manifestPath = resolve(projectRoot, `catalog/${environment}/v1/manifest.json`);
    manifests[environment] = JSON.parse(await readFile(manifestPath, "utf8"));
  }
  const sourceItems = manifests.testing.items;
  await mkdir(resolve(projectRoot, "catalog/testing/v1/thumbnails"), { recursive: true });
  await mkdir(resolve(projectRoot, "catalog/production/v1/thumbnails"), { recursive: true });

  for (const item of sourceItems) {
    const filename = `${item.id}-r${item.revision}.png`;
    const testingPath = resolve(projectRoot, `catalog/testing/v1/thumbnails/${filename}`);
    const productionPath = resolve(projectRoot, `catalog/production/v1/thumbnails/${filename}`);
    const url = `http://127.0.0.1:${port}/__thumbnail__?environment=testing&id=${encodeURIComponent(item.id)}`;
    await runChrome(url, testingPath);
    await copyFile(testingPath, productionPath);
    const digest = createHash("sha256").update(await readFile(testingPath)).digest("hex");
    for (const environment of environments) {
      const target = manifests[environment].items.find((candidate) => candidate.id === item.id);
      target.thumbnail = `thumbnails/${filename}`;
      target.integrity.thumbnailSha256 = digest;
    }
    console.log(`generated ${filename}`);
  }

  for (const environment of environments) {
    const manifestPath = resolve(projectRoot, `catalog/${environment}/v1/manifest.json`);
    await writeFile(manifestPath, `${JSON.stringify(manifests[environment], null, 2)}\n`);
  }
} finally {
  await new Promise((resolveClose) => server.close(resolveClose));
}
