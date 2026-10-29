import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

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
const rendererHost = {};
runInNewContext(rendererScript, { window: rendererHost });
const renderer = rendererHost.MockupRenderer;

test("shared geometry converts between screen plane and perspective canvas without drift", () => {
  const quad = [[120, 80], [880, 110], [830, 690], [150, 650]];
  for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1], [0.22, 0.74], [0.61, 0.38]]) {
    const canvasPoint = renderer.bilinearPoint(quad, u, v);
    const resolved = renderer.inverseBilinearPoint(quad, canvasPoint);
    assert.ok(Math.abs(resolved[0] - u) < 0.0001);
    assert.ok(Math.abs(resolved[1] - v) < 0.0001);
  }
  assert.deepEqual({ ...renderer.screenPlane(16 / 9) }, { width: 1200, height: 675 });
  assert.deepEqual(JSON.parse(JSON.stringify(renderer.frameCorners({ cx: 50, cy: 40, width: 20, height: 10, rotation: 0 }))), [[40, 35], [60, 35], [60, 45], [40, 45]]);
  const frame = { cx: 610, cy: 320, width: 360, height: 240, rotation: 7 };
  const surfaceQuad = [[120, 80], [880, 110], [830, 690], [150, 650]];
  const plane = renderer.screenPlane(16 / 9);
  const expectedFrameQuad = renderer.frameCorners(frame).map(([x, y]) => renderer.bilinearPoint(surfaceQuad, x / plane.width, y / plane.height));
  const actualFrameQuad = renderer.frameQuadOnSurface(frame, 16 / 9, surfaceQuad);
  for (let index = 0; index < 4; index += 1) {
    assert.ok(Math.abs(actualFrameQuad[index][0] - expectedFrameQuad[index][0]) < 0.000001);
    assert.ok(Math.abs(actualFrameQuad[index][1] - expectedFrameQuad[index][1]) < 0.000001);
  }
  const desiredFrameQuad = [[230, 170], [760, 130], [800, 590], [190, 620]];
  const recoveredSurfaceQuad = renderer.surfaceQuadForFrameQuad(frame, 16 / 9, desiredFrameQuad);
  const recoveredFrameQuad = renderer.frameQuadOnSurface(frame, 16 / 9, recoveredSurfaceQuad);
  for (let index = 0; index < 4; index += 1) {
    assert.ok(Math.abs(recoveredFrameQuad[index][0] - desiredFrameQuad[index][0]) < 0.000001);
    assert.ok(Math.abs(recoveredFrameQuad[index][1] - desiredFrameQuad[index][1]) < 0.000001);
  }
  const coverFrame = renderer.imageFrameForCover({ width: 900, height: 1600 }, { cx: 600, cy: 300, width: 1200, height: 600, rotation: 0 });
  assert.equal(Math.round(coverFrame.width), 1200);
  assert.equal(Math.round(coverFrame.height), 2133);
  const constrainedFrame = renderer.constrainImageFrameToCover(
    { width: 900, height: 1600 },
    { cx: 9999, cy: -9999, width: 1200, height: 2133.333, rotation: 12 },
    { cx: 600, cy: 300, width: 1200, height: 600, rotation: 0 }
  );
  assert.ok(constrainedFrame.width >= 1297);
  assert.ok(constrainedFrame.height >= 2306);
  assert.equal(constrainedFrame.rotation, 12);
  const fixedAperture = { cx: 600, cy: 337.5, width: 1200, height: 675, rotation: 0 };
  assert.deepEqual(
    JSON.parse(JSON.stringify(renderer.frameQuadOnSurface(fixedAperture, 16 / 9, [[260, 185], [1190, 185], [1190, 702], [260, 702]]))),
    [[260, 185], [1190, 185], [1190, 702], [260, 702]]
  );

  const moved = renderer.constrainFrameVisibility(
    { ...fixedAperture, cx: 5000, cy: -5000 },
    fixedAperture,
    0.1
  );
  assert.equal(moved.cx, 1680);
  assert.equal(moved.cy, -270);

  const eastResize = renderer.resizeFrameFromHandle(
    fixedAperture,
    "e",
    [1200, 337.5],
    [900, 337.5],
    true
  );
  assert.deepEqual({ ...eastResize }, { cx: 450, cy: 337.5, width: 900, height: 675, rotation: 0 });
  const cornerResize = renderer.resizeFrameFromHandle(
    fixedAperture,
    "se",
    [1200, 675],
    [900, 506.25],
    true
  );
  assert.deepEqual({ ...cornerResize }, { cx: 450, cy: 253.125, width: 900, height: 506.25, rotation: 0 });
  const fixedCoverFrame = renderer.imageFrameForCover({ width: 900, height: 1600 }, fixedAperture);
  const transformedImage = renderer.transformFrameBetweenFrames(
    fixedCoverFrame,
    fixedAperture,
    cornerResize
  );
  assert.equal(transformedImage.cx, cornerResize.cx);
  assert.equal(transformedImage.cy, cornerResize.cy);
  assert.equal(transformedImage.width, 900);
  assert.ok(Math.abs(transformedImage.height - 1600) < 0.001);
});

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

test("catalog thumbnails and empty preview share one complete default mockup render", () => {
  assert.match(rendererScript, /function createDefaultDesign\(asset\)/);
  assert.match(uiScript, /state\.designImage \|\| renderer\.createDefaultDesign\(state\.selectedAsset\)/);
  assert.match(uiScript, /const center = renderer\.bilinearPoint\(quad, 0\.5, 0\.5\)/);
  assert.match(uiStyles, /\.screen-cta span\s*\{[^}]*width:\s*40px[^}]*border:\s*0[^}]*background:\s*#07080aa3[^}]*backdrop-filter:\s*blur\(17px\)/s);
  assert.match(uiStyles, /\.screen-cta span::before\s*\{[^}]*background:\s*#ffffffa8[^}]*transform:\s*rotate\(-22deg\)/s);
  assert.doesNotMatch(uiStyles.match(/\.screen-cta span\s*\{[^}]*\}[\s\S]*?\.screen-cta:hover span\s*\{[^}]*\}/)?.[0] || "", /gradient/);
  assert.match(uiStyles, /\.source-popover\s*\{[^}]*border:\s*0[^}]*background:\s*#111114b8[^}]*backdrop-filter:\s*blur\(24px\)/s);
  assert.match(uiHtml, /id="screenCta" aria-label="添加画面"/);
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
    "cropToolbar",
    "resetPerspectiveButton"
  ]) assert.match(uiHtml, new RegExp(`id="${id}"`));
  assert.doesNotMatch(uiScript, /function drawImageToQuad|function adjustedDesignCanvas/);
  assert.match(uiScript, /freeTransform/);
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

test("one canonical content frame owns rendering, controls and direct transforms", () => {
  assert.match(rendererScript, /asset\.screen\.recommendedSize/);
  assert.doesNotMatch(uiHtml, /<option value="stretch">/);
  assert.match(uiHtml, /自动填满 · 不变形/);
  assert.match(uiHtml, /id="fitMode" type="hidden" value="cover"/);
  assert.match(rendererScript, /function screenPlane/);
  assert.match(rendererScript, /function normalizeFrame/);
  assert.match(rendererScript, /function frameQuadOnSurface/);
  assert.match(rendererScript, /function surfaceQuadForFrameQuad/);
  assert.match(rendererScript, /function imageFrameForCover/);
  assert.match(rendererScript, /function constrainImageFrameToCover/);
  assert.match(rendererScript, /function constrainFrameVisibility/);
  assert.match(rendererScript, /function resizeFrameFromHandle/);
  assert.match(rendererScript, /function transformFrameBetweenFrames/);
  assert.match(rendererScript, /function createContentCanvas/);
  assert.match(rendererScript, /frameQuadOnSurface\(content\.frame, targetAspect, surfaceQuad\)/);
  assert.match(rendererScript, /function apertureAlpha/);
  assert.match(rendererScript, /const minimumRun = Math\.max\(3, Math\.floor\(longest \* 0\.15\)\)/);
  assert.match(rendererScript, /const bleedQuad = expandQuad\(renderQuad, asset\.screen\.bleed \|\| 0\)/);
  assert.match(rendererScript, /drawImageToQuad\(screenContext, bleedCanvas, bleedQuad, quality\)/);
  assert.doesNotMatch(rendererScript, /createScreenCanvas\([^\n]+content\);/);
  assert.match(uiScript, /contentFrame:/);
  assert.match(uiScript, /imageFrame:/);
  assert.match(uiScript, /function fixedApertureFrame/);
  assert.match(uiScript, /state\.contentFrame = renderer\.constrainFrameVisibility/);
  assert.match(uiScript, /return renderer\.frameQuadOnSurface\(frame, targetAspect, activeQuad\(\)\)/);
  assert.doesNotMatch(uiScript, /state\.mode === "perspective"[^\n]*return cloneQuad\(activeQuad\(\)\)/);
  assert.match(uiScript, /renderer\.surfaceQuadForFrameQuad/);
  assert.match(uiScript, /return frameCanvasPoints\(state\.contentFrame\)/);
  assert.doesNotMatch(uiScript, /frameCanvasPoints\(state\.imageFrame\)/);
  assert.match(uiScript, /content: state\.designImage \? \{ frame: state\.contentFrame, imageFrame: state\.imageFrame \}/);
  assert.doesNotMatch(uiScript, /constrainCoverAdjustments|cropGeometry/);
  assert.match(uiHtml, /id="recommendedSize"/);
  assert.doesNotMatch(uiStyles, /\.canvas-wrap canvas\s*\{[^}]*max-width/s);
});

test("the design supports direct move, four-corner proportional resize and four-edge resize", () => {
  assert.match(uiScript, /function enableDesignEditing/);
  assert.match(uiScript, /designDragTarget\.addEventListener\("pointerdown"/);
  assert.match(uiScript, /\.design-scale-handle/);
  assert.match(uiScript, /pointOnScreenPlane/);
  assert.match(uiScript, /renderer\.resizeFrameFromHandle/);
  assert.match(uiScript, /renderer\.transformFrameBetweenFrames/);
  assert.doesNotMatch(uiScript, /resizeImageFromApertureHandle/);
  assert.doesNotMatch(uiScript, /state\.imageFrame = renderer\.constrainImageFrameToCover/);
  assert.match(uiScript, /window\.addEventListener\("pointermove", move/);
  assert.match(uiStyles, /\.design-drag-target\s*\{[^}]*cursor:\s*move/s);
  assert.equal((uiHtml.match(/class="design-scale-handle/g) || []).length, 8);
  assert.match(uiScript, /enterCropMode/);
  assert.match(uiScript, /state\.mode === "perspective" \|\| event\.metaKey \|\| event\.ctrlKey/);
});

test("source replacement and recovery stay visible in the preview workflow", () => {
  for (const id of ["replaceSourceButton", "resetCurrentButton", "sourcePopover", "quickReadSelectionButton", "quickImportFileButton"]) {
    assert.match(uiHtml, new RegExp(`id="${id}"`));
  }
  assert.equal((uiHtml.match(/id="imageInput"/g) || []).length, 1);
  assert.match(uiScript, /function resetCurrentMockup/);
  assert.match(uiScript, /function resetCurrentMockup\(\)[\s\S]*if \(state\.designImage\) resetContentGeometry\(\);/);
  assert.match(uiScript, /elements\.replaceSourceButton\.addEventListener\("click", toggleSourcePopover\)/);
});

test("the preview supports Figma-like pointer and trackpad navigation", () => {
  assert.match(uiScript, /function enableStageNavigation/);
  assert.match(uiScript, /elements\.stage\.addEventListener\("wheel"/);
  assert.match(uiScript, /event\.ctrlKey \|\| event\.metaKey/);
  assert.match(uiScript, /state\.panX -= event\.deltaX/);
  assert.match(uiScript, /translate\(\$\{state\.panX\}px, \$\{state\.panY\}px\) scale/);
  assert.match(uiScript, /const minimumVisible = 0\.11/);
  assert.match(uiScript, /width \* minimumVisible/);
  assert.match(uiScript, /height \* minimumVisible/);
  assert.match(uiScript, /interaction = \{ pointerId: event\.pointerId/);
  assert.match(uiScript, /window\.addEventListener\("pointermove", \(event\) => \{\s*if \(!interaction \|\| interaction\.pointerId !== event\.pointerId\) return;/s);
});

test("catalog spacing stays contained and hover never impersonates selection", () => {
  assert.match(uiStyles, /\.catalog-panel\s*\{[^}]*overflow:\s*hidden/s);
  assert.match(uiStyles, /--panel-pad:\s*16px/);
  assert.match(uiStyles, /\.asset-grid\s*\{[^}]*padding:\s*12px var\(--panel-pad\) 16px/s);
  assert.match(uiStyles, /\.recent-strip > div\s*\{[^}]*overflow-x:\s*auto[^}]*display:\s*flex[^}]*justify-content:\s*flex-start/s);
  assert.match(uiStyles, /--recent-thumb-size:\s*44px/);
  assert.match(uiStyles, /\.recent-item\s*\{[^}]*width:\s*var\(--recent-thumb-size\)[^}]*height:\s*var\(--recent-thumb-size\)/s);
  assert.match(uiStyles, /\.recent-item\s*\{[^}]*margin:\s*0[^}]*padding:\s*0/s);
  assert.match(uiStyles, /\.asset-card:hover:not\(\.active\)[^{]*\{[^}]*rotate\(var\(--hover-tilt/s);
  assert.match(uiScript, /function randomHoverTilt/);
  assert.match(uiScript, /button\.addEventListener\("pointerenter"/);
  assert.match(uiScript, /\? -4 : 4/);
  assert.match(uiScript, /\.slice\(0, 10\)/);
  assert.match(uiScript, /function enableRecentScrolling/);
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

test("one editor owns selection crop perspective and constant-size handles", () => {
  assert.doesNotMatch(uiHtml, /id="perspectiveEditor"|id="designEditorHint"/);
  assert.match(uiStyles, /--overlay-inverse-scale/);
  assert.match(uiStyles, /\.crop-toolbar/);
  assert.match(uiHtml, /id="cropShade"/);
  assert.match(uiScript, /enterCropMode/);
  assert.match(uiScript, /state\.cropSnapshot = editorSnapshot\(\)/);
  assert.match(uiScript, /if \(state\.cropMode\) state\.imageFrame = \{ \.\.\.interaction\.startImageFrame \}/);
  assert.match(uiScript, /state\.contentFrame = resizedContent/);
  assert.doesNotMatch(uiScript, /state\.imageFrame = renderer\.constrainImageFrameToCover/);
  assert.match(uiStyles, /\.design-editor\.is-cropping \.crop-shade/);
  assert.match(uiScript, /state\.mode === "perspective" \|\| event\.metaKey \|\| event\.ctrlKey/);
  assert.match(uiScript, /function undoEditor/);
  assert.match(uiScript, /function redoEditor/);
  assert.match(rendererScript, /const surfaceQuad = designQuad \|\| screenMaskQuad/);
  assert.match(rendererScript, /frameQuadOnSurface\(content\.frame, targetAspect, surfaceQuad\)/);
  assert.match(rendererScript, /clipQuad\(context, renderQuad\)/);
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
