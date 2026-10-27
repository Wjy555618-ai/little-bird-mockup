import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const rawUrl = process.argv[2];
if (!rawUrl) throw new Error("用法：npm run catalog:bind -- https://your-site.netlify.app/v1/manifest.json");

const catalogUrl = new URL(rawUrl);
if (catalogUrl.protocol !== "https:") throw new Error("生产素材地址必须使用 HTTPS");
if (!catalogUrl.pathname.endsWith("/manifest.json")) throw new Error("生产素材地址必须指向 manifest.json");
if (catalogUrl.username || catalogUrl.password || catalogUrl.search || catalogUrl.hash) throw new Error("生产素材地址不能包含凭据、查询或锚点");

const uiPath = resolve(projectRoot, "plugin/ui.js");
const manifestPath = resolve(projectRoot, "plugin/manifest.json");
const [uiSource, pluginManifest] = await Promise.all([
  readFile(uiPath, "utf8"),
  readFile(manifestPath, "utf8").then(JSON.parse)
]);

const nextUiSource = uiSource.replace(
  /const PRODUCTION_CATALOG_URL = "[^"]+";/,
  `const PRODUCTION_CATALOG_URL = ${JSON.stringify(catalogUrl.href)};`
);
if (nextUiSource === uiSource) throw new Error("未找到 PRODUCTION_CATALOG_URL，未修改任何文件");

pluginManifest.networkAccess ||= {};
pluginManifest.networkAccess.allowedDomains = [catalogUrl.origin];
await Promise.all([
  writeFile(uiPath, nextUiSource),
  writeFile(manifestPath, `${JSON.stringify(pluginManifest, null, 2)}\n`)
]);
console.log(`Production catalog: ${catalogUrl.href}`);
console.log(`Figma allowed domain: ${catalogUrl.origin}`);
console.log("请运行 npm run build && npm run check，再导入或发布插件。");
