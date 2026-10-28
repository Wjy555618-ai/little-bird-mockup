import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const pluginRoot = resolve(projectRoot, "plugin");
const [pluginManifest, code, uiScript, uiHtml, uiStyles, rendererScript, labHtml, labScript, serverScript, netlifyConfig, gitignore] = await Promise.all([
  readFile(resolve(pluginRoot, "manifest.json"), "utf8").then(JSON.parse),
  readFile(resolve(pluginRoot, "code.js"), "utf8"),
  readFile(resolve(pluginRoot, "ui.js"), "utf8"),
  readFile(resolve(pluginRoot, "ui.html"), "utf8"),
  readFile(resolve(pluginRoot, "styles.css"), "utf8"),
  readFile(resolve(projectRoot, "shared/mockup-renderer.js"), "utf8"),
  readFile(resolve(projectRoot, "asset-lab/index.html"), "utf8"),
  readFile(resolve(projectRoot, "asset-lab/app.js"), "utf8"),
  readFile(resolve(projectRoot, "scripts/serve-catalog.mjs"), "utf8"),
  readFile(resolve(projectRoot, "netlify.toml"), "utf8"),
  readFile(resolve(projectRoot, ".gitignore"), "utf8")
]);

test("plugin uses a fixed production domain and a development-only local catalog", () => {
  assert.deepEqual(pluginManifest.networkAccess.allowedDomains, ["https://assets.mockup-studio.example"]);
  assert.deepEqual(pluginManifest.networkAccess.devAllowedDomains, ["http://localhost:4173"]);
  assert.match(uiScript, /PRODUCTION_CATALOG_URL = "https:\/\/assets\.mockup-studio\.example\/v1\/manifest\.json"/);
  assert.match(uiScript, /DEVELOPMENT_CATALOG_URL/);
});

test("built UI contains the intended product modes without external scripts", () => {
  for (const label of ["样机", "画面调整", "透视编辑"]) {
    assert.match(uiHtml, new RegExp(label));
  }
  for (const removedLabel of ["动态", "3D 工作室", "弯曲", "套装"]) {
    assert.doesNotMatch(uiHtml, new RegExp(`>${removedLabel}<`));
  }
  assert.doesNotMatch(uiHtml, /\/\*__STYLES__\*\//);
  assert.doesNotMatch(uiHtml, /\/\*__RENDERER__\*\//);
  assert.doesNotMatch(uiHtml, /\/\*__SCRIPT__\*\//);
  assert.doesNotMatch(uiHtml, /\/\*__PDFJS__\*\//);
  assert.doesNotMatch(uiHtml, /\/\*__PDF_WORKER__\*\//);
  assert.doesNotMatch(uiHtml, /<script\s+src=/i);
});

test("plugin opens compactly and supports real collapse and expand states", () => {
  assert.match(code, /expanded:\s*\{ width: 820, height: 600 \}/);
  assert.match(code, /collapsed:\s*\{ width: 320, height: 64 \}/);
  assert.match(code, /figma\.ui\.resize\(next\.width, next\.height\)/);
  assert.match(uiScript, /setWindowState\("collapsed"\)/);
  assert.match(uiScript, /setWindowState\("expanded"\)/);
  assert.match(uiHtml, /id="collapseButton"/);
  assert.match(uiHtml, /id="expandButton"/);
});

test("visual system uses neutral Mockup-style controls without the old neon accent", () => {
  assert.doesNotMatch(uiStyles, /d8ff5c/i);
  assert.match(uiStyles, /\.asset-card\.active\s*\{[^}]*border-color:\s*#e0dfe3/s);
  assert.match(uiHtml, /class="primary-group"/);
});

test("the real vertical slice exports selection and writes rendered bytes back", () => {
  assert.match(code, /exportAsync/);
  assert.match(code, /figma\.createImage\(message\.bytes\)/);
  assert.match(code, /figma\.currentPage\.appendChild/);
  assert.match(code, /figma\.clientStorage\.setAsync/);
  assert.match(uiScript, /renderer\.renderComposite/);
  assert.match(uiScript, /paste-render/);
});

test("screen editing is real and exposes only functional controls", () => {
  for (const id of [
    "imageInput",
    "clearDesignButton",
    "designScale",
    "designOffsetX",
    "designOffsetY",
    "designRotation",
    "designBrightness",
    "designContrast",
    "designSaturation",
    "designEditor",
    "designDragTarget",
    "perspectiveEditor",
    "resetPerspectiveButton"
  ]) assert.match(uiHtml, new RegExp(`id="${id}"`));
  assert.doesNotMatch(uiScript, /function drawImageToQuad|function adjustedDesignCanvas/);
  assert.match(uiScript, /enablePerspectiveEditing/);
  assert.match(uiScript, /importDesignFile/);
  assert.doesNotMatch(uiHtml, /id="settingsButton"|id="aboutButton"|id="menuButton"/);
});

test("adjustment and perspective tabs own distinct left-panel content", () => {
  assert.match(uiHtml, /id="adjustControls"/);
  assert.match(uiHtml, /id="perspectiveControls"[^>]*hidden/);
  assert.match(uiHtml, /id="perspectiveStatus"/);
  assert.match(uiScript, /elements\.adjustControls\.hidden = mode !== "adjust"/);
  assert.match(uiScript, /elements\.perspectiveControls\.hidden = mode !== "perspective"/);
});

test("continuous editing uses responsive preview rendering and a final-quality commit", () => {
  assert.match(rendererScript, /quality === "preview"/);
  assert.match(uiScript, /requestAnimationFrame/);
  assert.match(uiScript, /scheduleComposite\("preview"\)/);
  assert.match(uiScript, /control\.addEventListener\("change", renderFinalComposite\)/);
  assert.match(uiScript, /renderFinalComposite\(\);\s*const blob = await canvasBlob\(\)/);
});

test("content keeps its own aspect ratio and uses the mockup canonical screen size", () => {
  assert.match(rendererScript, /asset\.screen\.recommendedSize/);
  assert.doesNotMatch(uiHtml, /<option value="stretch">/);
  assert.match(uiHtml, /完整显示（不变形）/);
  assert.match(uiHtml, /id="recommendedSize"/);
});

test("the design is one directly manipulable object inside the mockup", () => {
  assert.match(uiScript, /function enableDesignEditing/);
  assert.match(uiScript, /designDragTarget\.addEventListener\("pointerdown"/);
  assert.match(uiScript, /\.design-scale-handle/);
  assert.match(uiScript, /deltaToScreenCoordinates/);
  assert.match(uiStyles, /\.design-drag-target\s*\{[^}]*cursor:\s*move/s);
  assert.equal((uiHtml.match(/class="design-scale-handle/g) || []).length, 8);
  assert.match(uiScript, /oppositeHandle/);
  assert.match(uiScript, /state\.adjustments\.scale = interaction\.startScale \* ratio/);
});

test("source replacement and recovery stay visible in the preview workflow", () => {
  for (const id of ["replaceSourceButton", "resetCurrentButton", "sourcePopover", "quickReadSelectionButton", "quickImportFileButton"]) {
    assert.match(uiHtml, new RegExp(`id="${id}"`));
  }
  assert.equal((uiHtml.match(/id="imageInput"/g) || []).length, 1);
  assert.match(uiScript, /function resetCurrentMockup/);
  assert.match(uiScript, /elements\.replaceSourceButton\.addEventListener\("click", toggleSourcePopover\)/);
});

test("the preview supports Figma-like pointer and trackpad navigation", () => {
  assert.match(uiScript, /function enableStageNavigation/);
  assert.match(uiScript, /elements\.stage\.addEventListener\("wheel"/);
  assert.match(uiScript, /event\.ctrlKey \|\| event\.metaKey/);
  assert.match(uiScript, /state\.panX -= event\.deltaX/);
  assert.match(uiScript, /translate\(\$\{state\.panX\}px, \$\{state\.panY\}px\) scale/);
});

test("catalog spacing stays contained and hover never impersonates selection", () => {
  assert.match(uiStyles, /\.catalog-panel\s*\{[^}]*overflow:\s*hidden/s);
  assert.match(uiStyles, /\.recent-strip > div\s*\{[^}]*grid-template-columns:\s*repeat\(3/s);
  assert.match(uiStyles, /\.asset-card:hover:not\(\.active\)[^{]*\{[^}]*rotate\(var\(--hover-tilt/s);
  assert.match(uiScript, /function hoverTiltFor/);
});

test("Figma and local sources flatten to one static design object", () => {
  assert.match(code, /type:\s*"selection-composite"/);
  assert.match(code, /Figma 组合/);
  assert.match(uiScript, /composeSelectionLayers/);
  assert.match(uiScript, /importVideoFile/);
  assert.match(uiScript, /importPdfFile/);
  assert.match(uiHtml, /application\/pdf/);
});

test("similar filtering respects an explicitly selected category", () => {
  assert.match(uiScript, /const similarCategory = category !== "all" \? category : state\.selectedAsset\?\.category/);
  assert.match(uiScript, /item\.category !== similarCategory/);
});

test("perspective overlay leaves the center source action clickable", () => {
  assert.match(uiStyles, /\.perspective-editor\s*\{[^}]*pointer-events:\s*none/s);
  assert.match(uiStyles, /\.perspective-handle\s*\{[^}]*pointer-events:\s*auto/s);
  assert.match(uiStyles, /\.screen-cta\s*\{[^}]*z-index:\s*5/s);
});

test("plugin and asset lab use one shared renderer and one catalog schema", () => {
  assert.match(rendererScript, /const VERSION = "2\.1\.0"/);
  assert.match(labHtml, /src="\/shared\/mockup-renderer\.js"/);
  assert.match(labScript, /renderer\.renderComposite/);
  assert.match(serverScript, /catalog\/testing\/v1/);
  assert.match(serverScript, /\/api\/lab\/approve/);
  assert.match(serverScript, /\/api\/lab\/geometry/);
});

test("irrelevant paid-only filtering is removed", () => {
  assert.doesNotMatch(uiHtml, /仅免费|id="freeOnly"/);
  assert.doesNotMatch(uiScript, /freeOnly/);
});

test("search has one explicit clear action without a native search cancel control", () => {
  assert.match(uiHtml, /id="searchInput" type="text"/);
  assert.equal((uiHtml.match(/id="clearSearch"/g) || []).length, 1);
});

test("remote catalog is data-only and does not execute fetched JavaScript", () => {
  assert.match(uiScript, /response\.json\(\)/);
  assert.doesNotMatch(uiScript, /eval\s*\(/);
  assert.doesNotMatch(uiScript, /new Function\s*\(/);
});

test("catalog deployment publishes only data with immutable assets and uncached manifest", () => {
  assert.match(netlifyConfig, /publish\s*=\s*"catalog\/production"/);
  assert.match(netlifyConfig, /for\s*=\s*"\/v1\/manifest\.json"[\s\S]*no-store/);
  assert.match(netlifyConfig, /for\s*=\s*"\/v1\/assets\/\*"[\s\S]*immutable/);
  assert.match(netlifyConfig, /Access-Control-Allow-Origin\s*=\s*"\*"/);
  assert.match(gitignore, /^\.netlify\/$/m);
});
