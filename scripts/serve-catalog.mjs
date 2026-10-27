import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const catalogRoot = resolve(projectRoot, "catalog");
const pluginPreview = resolve(projectRoot, "plugin/ui.html");
const port = Number(process.env.MOCKUP_CATALOG_PORT || 4173);

const contentTypes = {
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".glb": "model/gltf-binary"
};

createServer(async (request, response) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Method Not Allowed");
    return;
  }

  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  if (url.pathname === "/preview" || url.pathname === "/preview/") {
    const data = await readFile(pluginPreview);
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    });
    if (request.method === "HEAD") response.end();
    else response.end(data);
    return;
  }

  const requestedPath = decodeURIComponent(url.pathname).replace(/^\/catalog\/?/, "");
  const filePath = resolve(catalogRoot, requestedPath || "v1/manifest.json");

  if (filePath !== catalogRoot && !filePath.startsWith(`${catalogRoot}${sep}`)) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("Not a file");
    const data = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": contentTypes[extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": filePath.endsWith("manifest.json") ? "no-store" : "public, max-age=31536000, immutable"
    });
    if (request.method === "HEAD") response.end();
    else response.end(data);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not Found");
  }
}).listen(port, () => {
  console.log(`Mockup catalog: http://localhost:${port}/catalog/v1/manifest.json`);
});

