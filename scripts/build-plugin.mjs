import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { findBuildPlaceholders } from "./lib/build-tokens.mjs";
import { isReservedOrLocalHostname } from "./lib/network-policy.mjs";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const pluginRoot = resolve(projectRoot, "plugin");
const args = process.argv.slice(2);

function argumentValue(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

function fail(message) {
  throw new Error(message);
}

function validateConfiguration(config, mode) {
  if (config.schemaVersion !== 1) fail("plugin.config.json schemaVersion 必须为 1");
  if (!/^\d+\.\d+\.\d+$/.test(config.pluginVersion)) fail("pluginVersion 必须是数字语义版本");
  if (config.catalogContract?.schemaVersion !== 5) fail("catalogContract.schemaVersion 必须为 5");
  if (config.catalogContract?.rendererVersion !== "2.4.0") fail("catalogContract.rendererVersion 必须为 2.4.0");
  if (!/^mockup-studio-catalog-v\d+$/.test(config.catalogContract?.cacheKey || "")) fail("catalogContract.cacheKey 格式无效");
  if (!Number.isInteger(config.catalogContract?.maxOfflineAgeHours) || config.catalogContract.maxOfflineAgeHours < 1 || config.catalogContract.maxOfflineAgeHours > 720) fail("maxOfflineAgeHours 必须为 1–720 的整数");
  if (!Number.isInteger(config.catalogContract?.maxItems) || config.catalogContract.maxItems < 1 || config.catalogContract.maxItems > 5000) fail("maxItems 必须为 1–5000 的整数");
  if (!Number.isInteger(config.catalogContract?.maxManifestBytes) || config.catalogContract.maxManifestBytes < 1024 || config.catalogContract.maxManifestBytes > 16 * 1024 * 1024) fail("maxManifestBytes 必须为 1KiB–16MiB 的整数");
  if (!Number.isInteger(config.catalogContract?.maxAssetBytes) || config.catalogContract.maxAssetBytes < 1024 || config.catalogContract.maxAssetBytes > 128 * 1024 * 1024) fail("maxAssetBytes 必须为 1KiB–128MiB 的整数");
  if (!Number.isInteger(config.catalogContract?.maxSelectionLayers) || config.catalogContract.maxSelectionLayers < 1 || config.catalogContract.maxSelectionLayers > 200) fail("maxSelectionLayers 必须为 1–200 的整数");
  if (!Number.isInteger(config.catalogContract?.maxSelectionExportBytes) || config.catalogContract.maxSelectionExportBytes < 1024 || config.catalogContract.maxSelectionExportBytes > 256 * 1024 * 1024) fail("maxSelectionExportBytes 必须为 1KiB–256MiB 的整数");
  if (!Number.isInteger(config.catalogContract?.maxLocalFileBytes) || config.catalogContract.maxLocalFileBytes < 1024 || config.catalogContract.maxLocalFileBytes > 256 * 1024 * 1024) fail("maxLocalFileBytes 必须为 1KiB–256MiB 的整数");

  const selected = config.environments?.[mode];
  if (!selected) fail(`未知构建模式：${mode}`);
  const catalogUrl = new URL(selected.catalogUrl);
  if (!catalogUrl.pathname.endsWith("/manifest.json") || catalogUrl.username || catalogUrl.password || catalogUrl.search || catalogUrl.hash) {
    fail(`${mode} catalogUrl 必须是无凭据、查询和锚点的 manifest.json 地址`);
  }
  if (!/^\d{10,25}$/.test(selected.pluginId || "")) fail(`${mode} pluginId 必须是 10–25 位数字`);

  if (mode === "development") {
    if (catalogUrl.protocol !== "http:" || catalogUrl.hostname !== "localhost") fail("开发目录必须来自 http://localhost");
    if (selected.catalogEnvironment !== "testing") fail("开发构建只能读取 testing 目录");
  } else if (mode === "pilot") {
    const production = config.environments?.production;
    if (catalogUrl.protocol !== "https:" || isReservedOrLocalHostname(catalogUrl.hostname)) fail("试运行目录必须使用真实 HTTPS 域名，禁止 IP、localhost 和保留测试域名");
    if (selected.catalogEnvironment !== "production") fail("试运行构建只能读取 production 目录");
    if (selected.catalogUrl !== production?.catalogUrl) fail("试运行构建必须与生产配置绑定同一精确 manifest");
    if (selected.pluginId !== "0000000000000000001" || selected.pluginId === config.environments?.development?.pluginId || selected.pluginId === production?.pluginId) fail("试运行构建必须使用专用本地插件身份，不得与开发或正式身份冲突");
  } else {
    if (catalogUrl.protocol !== "https:" || isReservedOrLocalHostname(catalogUrl.hostname)) fail("生产目录必须使用真实 HTTPS 域名，禁止 IP、localhost 和保留测试域名");
    if (/^0+$/.test(selected.pluginId)) fail("生产 pluginId 不能是全零占位值");
    if (selected.catalogEnvironment !== "production") fail("生产构建只能读取 production 目录");
  }
  return { selected, catalogUrl };
}

const mode = argumentValue("--mode", "development");
if (!["development", "pilot", "production"].includes(mode)) fail("--mode 仅支持 development、pilot 或 production");
const outputRoot = resolve(argumentValue("--out-dir", pluginRoot));
const configPath = resolve(argumentValue("--config", resolve(projectRoot, "config/plugin.config.json")));
const checkOnly = args.includes("--check");
const require = createRequire(import.meta.url);
const pdfEntry = require.resolve("pdfjs-dist/build/pdf.mjs");
const pdfWorkerEntry = require.resolve("pdfjs-dist/build/pdf.worker.mjs");

const [
  template,
  styles,
  renderer,
  catalogContract,
  resourceLimits,
  boundedResponse,
  assetCardHover,
  userErrorPolicy,
  script,
  pluginCodeTemplate,
  manifestTemplate,
  brandLogoSource,
  configSource,
  packageSource,
  lockfileSource,
  buildScriptSource,
  buildTokensSource,
  networkPolicySource,
  pdfBundle,
  pdfWorkerBundle
] = await Promise.all([
  readFile(resolve(pluginRoot, "ui.template.html"), "utf8"),
  readFile(resolve(pluginRoot, "styles.css"), "utf8"),
  readFile(resolve(projectRoot, "shared/mockup-renderer.js"), "utf8"),
  readFile(resolve(projectRoot, "shared/catalog-contract.js"), "utf8"),
  readFile(resolve(projectRoot, "shared/resource-limits.js"), "utf8"),
  readFile(resolve(projectRoot, "shared/bounded-response.js"), "utf8"),
  readFile(resolve(pluginRoot, "asset-card-hover.js"), "utf8"),
  readFile(resolve(projectRoot, "shared/user-error-policy.js"), "utf8"),
  readFile(resolve(pluginRoot, "ui.js"), "utf8"),
  readFile(resolve(pluginRoot, "code.template.js"), "utf8"),
  readFile(resolve(pluginRoot, "manifest.template.json"), "utf8"),
  readFile(resolve(pluginRoot, "assets/little-bird-mockup-logo.png")),
  readFile(configPath, "utf8"),
  readFile(resolve(projectRoot, "package.json"), "utf8"),
  readFile(resolve(projectRoot, "pnpm-lock.yaml"), "utf8"),
  readFile(fileURLToPath(import.meta.url), "utf8"),
  readFile(resolve(projectRoot, "scripts/lib/build-tokens.mjs"), "utf8"),
  readFile(resolve(projectRoot, "scripts/lib/network-policy.mjs"), "utf8"),
  build({
    entryPoints: [pdfEntry],
    bundle: true,
    format: "iife",
    globalName: "pdfjsLib",
    platform: "browser",
    target: "chrome110",
    minify: true,
    write: false
  }),
  build({
    entryPoints: [pdfWorkerEntry],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "chrome110",
    minify: true,
    write: false
  })
]);

const config = JSON.parse(configSource);
const packageJson = JSON.parse(packageSource);
const brandLogoSha256 = createHash("sha256").update(brandLogoSource).digest("hex");
const brandLogoDataUri = `data:image/png;base64,${brandLogoSource.toString("base64")}`;
if (packageJson.version !== config.pluginVersion) fail("package.json version 必须与 plugin.config.json pluginVersion 完全一致");
const { selected, catalogUrl } = validateConfiguration(config, mode);
const productionCatalogUrl = new URL(config.environments.production.catalogUrl);
const pluginCode = `${userErrorPolicy}\n${pluginCodeTemplate}`
  .replace('"__PLUGIN_VERSION__"', JSON.stringify(config.pluginVersion))
  .replace('"__CATALOG_CACHE_KEY__"', JSON.stringify(config.catalogContract.cacheKey))
  .replace("__MAX_SELECTION_LAYERS__", String(config.catalogContract.maxSelectionLayers))
  .replace("__MAX_SELECTION_EXPORT_BYTES__", String(config.catalogContract.maxSelectionExportBytes));
if (/__[A-Z0-9_]+__/.test(pluginCode)) fail("plugin main code 存在未替换配置令牌");

const manifest = {
  ...JSON.parse(manifestTemplate),
  id: selected.pluginId,
  networkAccess: {
    allowedDomains: [mode === "production" ? catalogUrl.origin : productionCatalogUrl.origin],
    ...(mode === "development" ? { devAllowedDomains: [catalogUrl.origin] } : {})
  }
};
const manifestOutput = `${JSON.stringify(manifest, null, 2)}\n`;

const runtimeScript = script
  .replace('"__PLUGIN_VERSION__"', JSON.stringify(config.pluginVersion))
  .replace('"__BUILD_MODE__"', JSON.stringify(mode))
  .replace('"__CATALOG_URL__"', JSON.stringify(catalogUrl.href))
  .replace('"__CATALOG_ENVIRONMENT__"', JSON.stringify(selected.catalogEnvironment))
  .replace("__CATALOG_SCHEMA_VERSION__", String(config.catalogContract.schemaVersion))
  .replace('"__RENDERER_VERSION__"', JSON.stringify(config.catalogContract.rendererVersion))
  .replace('"__CATALOG_CACHE_KEY__"', JSON.stringify(config.catalogContract.cacheKey))
  .replace("__MAX_OFFLINE_AGE_HOURS__", String(config.catalogContract.maxOfflineAgeHours))
  .replace("__MAX_CATALOG_ITEMS__", String(config.catalogContract.maxItems))
  .replace("__MAX_CATALOG_MANIFEST_BYTES__", String(config.catalogContract.maxManifestBytes))
  .replace("__MAX_CATALOG_ASSET_BYTES__", String(config.catalogContract.maxAssetBytes))
  .replace("__MAX_LOCAL_FILE_BYTES__", String(config.catalogContract.maxLocalFileBytes));

for (const token of ["__PLUGIN_VERSION__", "__BUILD_MODE__", "__CATALOG_URL__", "__CATALOG_ENVIRONMENT__", "__CATALOG_SCHEMA_VERSION__", "__RENDERER_VERSION__", "__CATALOG_CACHE_KEY__", "__MAX_OFFLINE_AGE_HOURS__", "__MAX_CATALOG_ITEMS__", "__MAX_CATALOG_MANIFEST_BYTES__", "__MAX_CATALOG_ASSET_BYTES__", "__MAX_LOCAL_FILE_BYTES__"]) {
  if (runtimeScript.includes(token)) fail(`未替换运行时配置令牌：${token}`);
}

const pdfScript = pdfBundle.outputFiles[0].text.replace(/<\/script/gi, "<\\\\/script");
const pdfWorkerSource = JSON.stringify(pdfWorkerBundle.outputFiles[0].text).replaceAll("<", "\\u003c");
const pdfWorkerScript = `window.__PDF_WORKER_SOURCE__=${pdfWorkerSource};`;
const fingerprintInput = [
  template,
  styles,
  renderer,
  catalogContract,
  resourceLimits,
  boundedResponse,
  assetCardHover,
  userErrorPolicy,
  runtimeScript,
  pluginCode,
  manifestOutput,
  brandLogoSha256,
  configSource,
  packageSource,
  lockfileSource,
  buildScriptSource,
  buildTokensSource,
  networkPolicySource,
  pdfScript,
  pdfWorkerScript
].join("\n--mockup-studio-build-input--\n");
const fingerprintPrefix = mode === "production" ? "REL" : mode === "pilot" ? "PILOT" : "DEV";
const buildFingerprint = `${fingerprintPrefix}-${createHash("sha256").update(fingerprintInput).digest("hex").slice(0, 12).toUpperCase()}`;

const uiOutput = template
  .replace("/*__STYLES__*/", () => styles)
  .replaceAll("__BRAND_LOGO_DATA_URI__", brandLogoDataUri)
  .replace("/*__PDFJS__*/", () => pdfScript)
  .replace("/*__PDF_WORKER__*/", () => pdfWorkerScript)
  .replace("/*__RENDERER__*/", () => renderer)
  .replace("/*__CATALOG_CONTRACT__*/", () => catalogContract)
  .replace("/*__RESOURCE_LIMITS__*/", () => resourceLimits)
  .replace("/*__BOUNDED_RESPONSE__*/", () => boundedResponse)
  .replace("/*__ASSET_CARD_HOVER__*/", () => assetCardHover)
  .replace("/*__USER_ERROR_POLICY__*/", () => userErrorPolicy)
  .replace("/*__SCRIPT__*/", () => runtimeScript)
  .replaceAll("__BUILD_FINGERPRINT__", buildFingerprint);

const remainingPlaceholders = findBuildPlaceholders(`${uiOutput}\n${manifestOutput}\n${pluginCode}`);
if (remainingPlaceholders.length) fail(`构建制品存在未替换令牌：${remainingPlaceholders.join(", ")}`);

async function compareOutput(name, expected) {
  const current = await readFile(resolve(outputRoot, name), "utf8").catch(() => "");
  if (current !== expected) {
    console.error(`${resolve(outputRoot, name)} is stale. Run pnpm build.`);
    process.exitCode = 1;
  }
}

if (checkOnly) {
  await Promise.all([
    compareOutput("ui.html", uiOutput),
    compareOutput("manifest.json", manifestOutput),
    compareOutput("code.js", pluginCode)
  ]);
} else {
  await mkdir(outputRoot, { recursive: true });
  await Promise.all([
    writeFile(resolve(outputRoot, "ui.html"), uiOutput),
    writeFile(resolve(outputRoot, "manifest.json"), manifestOutput),
    writeFile(resolve(outputRoot, "code.js"), pluginCode)
  ]);
  console.log(`Built ${mode} plugin (${buildFingerprint}) in ${outputRoot}`);
}
