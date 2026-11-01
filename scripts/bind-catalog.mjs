import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isReservedOrLocalHostname } from "./lib/network-policy.mjs";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2);
const rawUrl = args.find((argument) => !argument.startsWith("--"));
if (!rawUrl) throw new Error("用法：pnpm catalog:bind -- https://assets.example.com/v1/manifest.json [--plugin-id 1234567890123456789]");

const pluginIdIndex = args.indexOf("--plugin-id");
const pluginId = pluginIdIndex >= 0 ? args[pluginIdIndex + 1] : null;
const catalogUrl = new URL(rawUrl);
if (catalogUrl.protocol !== "https:") throw new Error("生产素材地址必须使用 HTTPS");
if (!catalogUrl.pathname.endsWith("/manifest.json")) throw new Error("生产素材地址必须指向 manifest.json");
if (catalogUrl.username || catalogUrl.password || catalogUrl.search || catalogUrl.hash) throw new Error("生产素材地址不能包含凭据、查询或锚点");
if (isReservedOrLocalHostname(catalogUrl.hostname)) {
  throw new Error("生产素材地址必须使用真实域名，禁止 IP、localhost 和保留测试域名");
}
if (pluginId !== null && (!/^\d{10,25}$/.test(pluginId) || /^0+$/.test(pluginId))) {
  throw new Error("正式 Figma plugin ID 必须是 10–25 位非全零数字");
}

const configPath = resolve(projectRoot, "config/plugin.config.json");
const config = JSON.parse(await readFile(configPath, "utf8"));
config.environments.production.catalogUrl = catalogUrl.href;
if (pluginId !== null) config.environments.production.pluginId = pluginId;
await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);

console.log(`Production catalog: ${catalogUrl.href}`);
console.log(pluginId === null ? "Production plugin ID unchanged" : `Production plugin ID: ${pluginId}`);
console.log("单一配置已更新；运行 pnpm build 生成开发插件，运行 pnpm release:check 执行生产发布门禁。");
