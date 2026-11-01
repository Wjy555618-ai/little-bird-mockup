import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import sharp from "sharp";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const pluginRoot = resolve(projectRoot, "plugin");
const brandLogoBytes = await readFile(resolve(pluginRoot, "assets/little-bird-mockup-logo-dark-ui.png"));
const lightBrandLogoBytes = await readFile(resolve(pluginRoot, "assets/little-bird-mockup-logo-light-surface.png"));
const brandLogoSource = await readFile(resolve(pluginRoot, "assets/little-bird-mockup-logo-source.png"));
const brandContract = await readFile(resolve(pluginRoot, "assets/little-bird-mockup-brand-contract.json"), "utf8").then(JSON.parse);
const [pluginManifest, pluginConfig, buildScript, code, codeTemplate, uiScript, uiHtml, uiStyles, assetCardHoverScript, rendererScript, catalogContractScript, resourceLimitsScript, boundedResponseScript, labHtml, labScript, serverScript, netlifyConfig, gitignore] = await Promise.all([
  readFile(resolve(pluginRoot, "manifest.json"), "utf8").then(JSON.parse),
  readFile(resolve(projectRoot, "config/plugin.config.json"), "utf8").then(JSON.parse),
  readFile(resolve(projectRoot, "scripts/build-plugin.mjs"), "utf8"),
  readFile(resolve(pluginRoot, "code.js"), "utf8"),
  readFile(resolve(pluginRoot, "code.template.js"), "utf8"),
  readFile(resolve(pluginRoot, "ui.js"), "utf8"),
  readFile(resolve(pluginRoot, "ui.html"), "utf8"),
  readFile(resolve(pluginRoot, "styles.css"), "utf8"),
  readFile(resolve(pluginRoot, "asset-card-hover.js"), "utf8"),
  readFile(resolve(projectRoot, "shared/mockup-renderer.js"), "utf8"),
  readFile(resolve(projectRoot, "shared/catalog-contract.js"), "utf8"),
  readFile(resolve(projectRoot, "shared/resource-limits.js"), "utf8"),
  readFile(resolve(projectRoot, "shared/bounded-response.js"), "utf8"),
  readFile(resolve(projectRoot, "asset-lab/index.html"), "utf8"),
  readFile(resolve(projectRoot, "asset-lab/app.js"), "utf8"),
  readFile(resolve(projectRoot, "scripts/serve-catalog.mjs"), "utf8"),
  readFile(resolve(projectRoot, "netlify.toml"), "utf8"),
  readFile(resolve(projectRoot, ".gitignore"), "utf8")
]);
const rendererHost = {};
runInNewContext(rendererScript, { window: rendererHost });
const renderer = rendererHost.MockupRenderer;
const catalogContractHost = {};
runInNewContext(catalogContractScript, { window: catalogContractHost });
const catalogContract = catalogContractHost.MockupCatalogContract;
const assetCardHoverHost = {};
runInNewContext(assetCardHoverScript, { window: assetCardHoverHost });
const assetCardHover = assetCardHoverHost.MockupAssetCardHover;

function fakeAssetCard() {
  const classes = new Set();
  const properties = new Map();
  return {
    dataset: {},
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name)
    },
    style: {
      setProperty: (name, value) => properties.set(name, value),
      getPropertyValue: (name) => properties.get(name) || ""
    },
    contains: (target) => target?.ownerCard === true
  };
}

const chromeCandidates = [
  process.env.MOCKUP_STUDIO_CHROME,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium"
].filter(Boolean);

async function availableChrome() {
  for (const candidate of chromeCandidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {}
  }
  return null;
}

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

  const moved = renderer.constrainFrameToBounds(
    { ...fixedAperture, cx: 5000, cy: -5000 },
    fixedAperture
  );
  assert.equal(moved.cx, fixedAperture.cx);
  assert.equal(moved.cy, fixedAperture.cy);
  const rotatedInside = renderer.constrainFrameToBounds(
    { ...fixedAperture, cx: -5000, cy: 5000, rotation: 24 },
    fixedAperture
  );
  for (const [x, y] of renderer.frameCorners(rotatedInside)) {
    assert.ok(x >= -0.0001 && x <= fixedAperture.width + 0.0001);
    assert.ok(y >= -0.0001 && y <= fixedAperture.height + 0.0001);
  }
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

  const boundedStart = { cx: 600, cy: 337.5, width: 600, height: 300, rotation: 0 };
  const sideCases = [
    { handle: "e", start: [900, 337.5], pointer: [1600, 337.5], fixed: "left", perpendicular: "height" },
    { handle: "w", start: [300, 337.5], pointer: [-400, 337.5], fixed: "right", perpendicular: "height" },
    { handle: "n", start: [600, 187.5], pointer: [600, -400], fixed: "bottom", perpendicular: "width" },
    { handle: "s", start: [600, 487.5], pointer: [600, 1100], fixed: "top", perpendicular: "width" }
  ];
  const edges = (frame) => ({
    left: frame.cx - frame.width / 2,
    right: frame.cx + frame.width / 2,
    top: frame.cy - frame.height / 2,
    bottom: frame.cy + frame.height / 2
  });
  for (const scenario of sideCases) {
    const resized = renderer.resizeFrameWithinBounds(
      boundedStart,
      scenario.handle,
      scenario.start,
      scenario.pointer,
      fixedAperture,
      true
    );
    assert.ok(renderer.frameFitsWithinBounds(resized, fixedAperture), `${scenario.handle} remains inside bounds`);
    assert.ok(Math.abs(resized[scenario.perpendicular] - boundedStart[scenario.perpendicular]) < 0.0001, `${scenario.handle} never changes the perpendicular axis`);
    assert.ok(Math.abs(edges(resized)[scenario.fixed] - edges(boundedStart)[scenario.fixed]) < 0.0001, `${scenario.handle} keeps the opposite edge anchored`);
  }
  const fixedCoverFrame = renderer.imageFrameForCover({ width: 900, height: 1600 }, fixedAperture);
  const transformedImage = renderer.transformFrameBetweenFrames(fixedCoverFrame, fixedAperture, cornerResize);
  assert.equal(transformedImage.cx, cornerResize.cx);
  assert.equal(transformedImage.cy, cornerResize.cy);
  assert.equal(transformedImage.width, 900);
  assert.ok(Math.abs(transformedImage.height - 1600) < 0.001);

  const blockedFrameMove = renderer.constrainFrameToBounds(
    { ...fixedAperture, cy: fixedAperture.cy - 100 },
    fixedAperture
  );
  const pannedSource = renderer.constrainImageFrameToCover(
    { width: 1200, height: 900 },
    { ...renderer.imageFrameForCover({ width: 1200, height: 900 }, fixedAperture), cy: fixedAperture.cy - 100 },
    blockedFrameMove
  );
  assert.equal(blockedFrameMove.cy, fixedAperture.cy, "full-aperture frame stays physically contained");
  assert.equal(pannedSource.cy, fixedAperture.cy - 100, "blocked frame movement pans the covered source instead of becoming inert");
});

test("adjustment controls transform the covered source without resizing the physical aperture", () => {
  const frame = { cx: 600, cy: 337.5, width: 1200, height: 675, rotation: 0 };
  const image = { width: 2048, height: 1454 };
  const defaults = renderer.imageFrameFromAdjustments(image, frame, renderer.DEFAULT_ADJUSTMENTS);
  const adjusted = renderer.imageFrameFromAdjustments(image, frame, {
    ...renderer.DEFAULT_ADJUSTMENTS,
    scale: 1.75,
    offsetX: 0.4,
    offsetY: -0.3,
    rotation: 12
  });
  assert.ok(adjusted.width > defaults.width * 1.7, "scale above 100% must zoom the source instead of being clamped by the aperture");
  assert.ok(adjusted.height > defaults.height * 1.7);
  assert.notEqual(adjusted.cx, frame.cx, "horizontal adjustment must pan the source");
  assert.notEqual(adjusted.cy, frame.cy, "vertical adjustment must pan the source");
  assert.equal(adjusted.rotation, 12);
  assert.deepEqual({ ...frame }, { cx: 600, cy: 337.5, width: 1200, height: 675, rotation: 0 }, "adjustments must leave the physical aperture unchanged");

  const roundTrip = renderer.adjustmentsFromImageFrame(image, adjusted, frame, renderer.DEFAULT_ADJUSTMENTS);
  assert.ok(Math.abs(roundTrip.scale - 1.75) < 0.0001);
  assert.ok(Math.abs(roundTrip.offsetX - 0.4) < 0.0001);
  assert.ok(Math.abs(roundTrip.offsetY + 0.3) < 0.0001);
  assert.ok(Math.abs(roundTrip.rotation - 12) < 0.0001);

  const minimum = renderer.imageFrameFromAdjustments(image, frame, { scale: 0.2, offsetX: 1, offsetY: 1, rotation: 30 });
  const resolvedMinimum = renderer.adjustmentsFromImageFrame(image, minimum, frame, renderer.DEFAULT_ADJUSTMENTS);
  assert.equal(resolvedMinimum.scale, 1, "auto-fill must reject zoom levels that would expose an empty aperture");
});

test("final composited magenta user pixels never escape the projected control frame", async () => {
  const chrome = await availableChrome();
  assert.ok(chrome, "Chrome/Chromium is mandatory for the real Canvas 2D pixel invariant; this release test may not be skipped");

  const manifest = JSON.parse(await readFile(resolve(projectRoot, "catalog/testing/v1/manifest.json"), "utf8"));
  const workDir = await mkdtemp(resolve(tmpdir(), "mockup-pixel-invariant-"));
  const resultPath = resolve(workDir, "pixel-invariant.html");
  const html = `<!doctype html><meta charset="utf-8"><body>RUNNING<script>${rendererScript}</script><script>
    const assets = ${JSON.stringify(manifest.items)};
    const results = [];
    for (const asset of assets) {
      const renderer = window.MockupRenderer;
      const base = document.createElement("canvas");
      base.width = asset.canvas.width;
      base.height = asset.canvas.height;
      const baseContext = base.getContext("2d");
      baseContext.fillStyle = "rgb(0,255,0)";
      baseContext.fillRect(0, 0, base.width, base.height);

      const design = document.createElement("canvas");
      design.width = 1200;
      design.height = 900;
      const designContext = design.getContext("2d");
      designContext.fillStyle = "rgb(255,0,255)";
      designContext.fillRect(0, 0, design.width, design.height);

      const targetAspect = asset.screen.recommendedSize.width / asset.screen.recommendedSize.height;
      const plane = renderer.screenPlane(targetAspect);
      const bounds = renderer.baselineFrameForAspect(targetAspect);
      const perspectiveQuad = [[0.06, 0.05], [0.95, 0.09], [0.9, 0.94], [0.11, 0.89]]
        .map(([u, v]) => renderer.bilinearPoint(asset.screen.aperture.quad, u, v));
      const scenarios = [
        {
          id: "rotated-center",
          surfaceQuad: asset.screen.quad,
          frame: { cx: plane.width * 0.54, cy: plane.height * 0.47, width: plane.width * 0.68, height: plane.height * 0.72, rotation: 6 }
        },
        {
          id: "boundary-crop",
          surfaceQuad: asset.screen.quad,
          frame: { cx: plane.width * 0.91, cy: plane.height * 0.88, width: plane.width * 0.46, height: plane.height * 0.52, rotation: -5 }
        },
        {
          id: "free-perspective",
          surfaceQuad: perspectiveQuad,
          frame: { cx: plane.width * 0.43, cy: plane.height * 0.52, width: plane.width * 0.63, height: plane.height * 0.58, rotation: 4 }
        }
      ];

      for (const scenario of scenarios) {
        const frame = renderer.constrainFrameToBounds(scenario.frame, bounds);
        const imageFrame = renderer.imageFrameForCover(design, frame);
        const geometry = renderer.contentGeometry(design, targetAspect, scenario.surfaceQuad, frame, imageFrame);
        const output = document.createElement("canvas");
        output.width = asset.canvas.width;
        output.height = asset.canvas.height;
        renderer.renderComposite({
          canvas: output,
          asset,
          baseImage: base,
          designImage: design,
          designQuad: scenario.surfaceQuad,
          content: { frame, imageFrame },
          quality: "final"
        });

        const outputContext = output.getContext("2d", { willReadFrequently: true });
        const pixels = outputContext.getImageData(0, 0, output.width, output.height).data;
        const path = new Path2D();
        path.moveTo(geometry.renderQuad[0][0], geometry.renderQuad[0][1]);
        for (let index = 1; index < geometry.renderQuad.length; index += 1) {
          path.lineTo(geometry.renderQuad[index][0], geometry.renderQuad[index][1]);
        }
        path.closePath();
        let insideMagenta = 0;
        let outsideMagenta = 0;
        for (let y = 0; y < output.height; y += 1) {
          for (let x = 0; x < output.width; x += 1) {
            const index = (y * output.width + x) * 4;
            const magenta = pixels[index] >= 240 && pixels[index + 1] <= 12 && pixels[index + 2] >= 240;
            if (!magenta) continue;
            if (outputContext.isPointInPath(path, x + 0.5, y + 0.5)) insideMagenta += 1;
            else outsideMagenta += 1;
          }
        }
        results.push({ id: asset.id, scenario: scenario.id, insideMagenta, outsideMagenta });
      }
    }
    document.body.textContent = "PIXEL_RESULT:" + JSON.stringify(results);
  </script></body>`;
  await writeFile(resultPath, html);
  try {
    const run = spawnSync(chrome, [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--allow-file-access-from-files",
      "--dump-dom",
      `file://${resultPath}`
    ], { encoding: "utf8", timeout: 30_000, maxBuffer: 8 * 1024 * 1024 });
    assert.equal(run.status, 0, run.stderr || "headless Chrome failed");
    const match = run.stdout.match(/PIXEL_RESULT:(\[[^<]+\])/);
    assert.ok(match, `pixel result missing from browser output: ${run.stdout.slice(-1000)}`);
    const results = JSON.parse(match[1].replaceAll("&quot;", '"'));
    assert.equal(results.length, manifest.items.length * 3);
    for (const result of results) {
      assert.ok(result.insideMagenta > 1000, `${result.id}/${result.scenario} did not render the high-contrast user layer`);
      assert.equal(result.outsideMagenta, 0, `${result.id}/${result.scenario} leaked final user pixels outside its projected control frame`);
    }
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});

test("editable frame, rendered pixels and overlay share one projected geometry", async () => {
  const manifest = JSON.parse(await readFile(resolve(projectRoot, "catalog/testing/v1/manifest.json"), "utf8"));
  for (const asset of manifest.items) {
    const targetAspect = asset.screen.recommendedSize.width / asset.screen.recommendedSize.height;
    const plane = renderer.screenPlane(targetAspect);
    const baselineFrame = { cx: plane.width / 2, cy: plane.height / 2, width: plane.width, height: plane.height, rotation: 0 };
    const image = { width: 900, height: 1600 };
    const cover = renderer.imageFrameForCover(image, baselineFrame);
    const contentFrame = {
      cx: plane.width * 0.55,
      cy: plane.height * 0.47,
      width: plane.width * 0.72,
      height: plane.height * 0.72,
      rotation: 4
    };
    const imageFrame = renderer.transformFrameBetweenFrames(cover, baselineFrame, contentFrame);
    const geometry = renderer.contentGeometry(image, targetAspect, asset.screen.quad, contentFrame, imageFrame);
    const expectedQuad = renderer.frameQuadOnSurface(geometry.frame, targetAspect, asset.screen.quad);
    assert.deepEqual(JSON.parse(JSON.stringify(geometry.baselineFrame)), baselineFrame, `${asset.id} baseline frame must be aspect-derived`);
    assert.deepEqual(JSON.parse(JSON.stringify(geometry.renderQuad)), JSON.parse(JSON.stringify(expectedQuad)), `${asset.id} pixels must use the editable frame quad`);
    assert.deepEqual(JSON.parse(JSON.stringify(geometry.overlayQuad)), JSON.parse(JSON.stringify(expectedQuad)), `${asset.id} overlay must use the rendered frame quad`);
    assert.deepEqual(JSON.parse(JSON.stringify(geometry.imageFrame)), JSON.parse(JSON.stringify(imageFrame)), `${asset.id} source transform must remain independent from its crop frame`);
    assert.notDeepEqual(JSON.parse(JSON.stringify(geometry.renderQuad)), asset.screen.quad, `${asset.id} movable frame must not be collapsed to the fixed aperture`);
    for (const [x, y] of renderer.frameCorners(geometry.frame)) {
      assert.ok(x >= -0.0001 && x <= plane.width + 0.0001, `${asset.id} editable frame escaped the physical aperture horizontally`);
      assert.ok(y >= -0.0001 && y <= plane.height + 0.0001, `${asset.id} editable frame escaped the physical aperture vertically`);
    }

    for (const point of [
      ...geometry.overlayQuad,
      ...geometry.overlayQuad.map((value, index) => {
        const next = geometry.overlayQuad[(index + 1) % 4];
        return [(value[0] + next[0]) / 2, (value[1] + next[1]) / 2];
      })
    ]) {
      const planePoint = renderer.canvasPointToPlane(point, geometry);
      const roundTrip = renderer.planePointToCanvas(planePoint, geometry);
      assert.ok(Math.hypot(roundTrip[0] - point[0], roundTrip[1] - point[1]) < 0.01, `${asset.id} overlay round-trip drifted`);
    }
  }
});

test("viewport, CSS pixels and backing-store pixels map to one logical canvas space", () => {
  const logicalSize = { width: 1448, height: 1086 };
  const logicalPoint = [913.25, 427.75];
  for (const zoom of [1, 2.57, 2.93, 3]) {
    for (const dpr of [1, 2]) {
      const cssWidth = 688 * zoom;
      const cssHeight = cssWidth * logicalSize.height / logicalSize.width;
      const rect = { left: 37, top: 91, width: cssWidth, height: cssHeight };
      const clientPoint = [
        rect.left + logicalPoint[0] / logicalSize.width * rect.width,
        rect.top + logicalPoint[1] / logicalSize.height * rect.height
      ];
      const resolved = renderer.viewportPointToCanvas(clientPoint, rect, logicalSize);
      assert.ok(Math.hypot(resolved[0] - logicalPoint[0], resolved[1] - logicalPoint[1]) < 0.000001, `zoom=${zoom}, dpr=${dpr}`);
      const backingPoint = renderer.logicalPointToBackingStore(resolved, logicalSize, {
        width: logicalSize.width * dpr,
        height: logicalSize.height * dpr
      });
      assert.ok(Math.hypot(
        backingPoint[0] - logicalPoint[0] * dpr,
        backingPoint[1] - logicalPoint[1] * dpr
      ) < 0.000001);
    }
  }
});

test("build mode and network policy come from one fail-closed configuration", () => {
  const development = pluginConfig.environments.development;
  const pilot = pluginConfig.environments.pilot;
  const production = pluginConfig.environments.production;
  assert.deepEqual(pluginManifest.networkAccess.allowedDomains, [new URL(production.catalogUrl).origin]);
  assert.deepEqual(pluginManifest.networkAccess.devAllowedDomains, [new URL(development.catalogUrl).origin]);
  assert.equal(pluginManifest.id, development.pluginId);
  assert.equal(pilot.catalogUrl, production.catalogUrl);
  assert.equal(pilot.catalogEnvironment, "production");
  assert.equal(pilot.pluginId, "0000000000000000001");
  assert.notEqual(pilot.pluginId, development.pluginId);
  assert.match(uiScript, /const ACTIVE_CATALOG_URL = "__CATALOG_URL__"/);
  assert.doesNotMatch(uiScript, /https?:\/\/(?:localhost|assets\.mockup-studio\.example)/);
  assert.doesNotMatch(uiScript, /PRODUCTION_CATALOG_URL|DEVELOPMENT_CATALOG_URL/);
  assert.match(buildScript, /mode === "production"/);
  assert.match(buildScript, /禁止 IP、localhost 和保留测试域名/);
  assert.match(buildScript, /生产 pluginId 不能是全零占位值/);
  assert.match(codeTemplate, /PLUGIN_VERSION = "__PLUGIN_VERSION__"/);
  assert.match(codeTemplate, /CATALOG_CACHE_KEY = "__CATALOG_CACHE_KEY__"/);
  assert.match(codeTemplate, /MAX_SELECTION_LAYERS = __MAX_SELECTION_LAYERS__/);
  assert.match(codeTemplate, /MAX_SELECTION_EXPORT_BYTES = __MAX_SELECTION_EXPORT_BYTES__/);
  assert.match(code, new RegExp(`PLUGIN_VERSION = "${pluginConfig.pluginVersion.replaceAll(".", "\\.")}"`));
  assert.match(code, new RegExp(`CATALOG_CACHE_KEY = "${pluginConfig.catalogContract.cacheKey}"`));
  assert.match(code, new RegExp(`MAX_SELECTION_LAYERS = ${pluginConfig.catalogContract.maxSelectionLayers}`));
  assert.match(code, new RegExp(`MAX_SELECTION_EXPORT_BYTES = ${pluginConfig.catalogContract.maxSelectionExportBytes}`));
});

test("pilot builder uses the exact remote production catalog without a fake production identity", async () => {
  const workDir = await mkdtemp(resolve(tmpdir(), "mockup-pilot-build-"));
  try {
    const outputPath = resolve(workDir, "plugin");
    const result = spawnSync(process.execPath, [
      "scripts/build-plugin.mjs",
      "--mode", "pilot",
      "--out-dir", outputPath
    ], { cwd: projectRoot, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const [manifest, ui] = await Promise.all([
      readFile(resolve(outputPath, "manifest.json"), "utf8").then(JSON.parse),
      readFile(resolve(outputPath, "ui.html"), "utf8")
    ]);
    assert.equal(manifest.id, pluginConfig.environments.pilot.pluginId);
    assert.notEqual(manifest.id, pluginConfig.environments.development.pluginId);
    assert.deepEqual(manifest.networkAccess.allowedDomains, [new URL(pluginConfig.environments.production.catalogUrl).origin]);
    assert.equal(Object.hasOwn(manifest.networkAccess, "devAllowedDomains"), false);
    assert.match(ui, /PILOT-[A-F0-9]{12}/);
    assert.match(ui, new RegExp(pluginConfig.environments.production.catalogUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(ui, /http:\/\/localhost:4173\/catalog\/testing/);

    const invalid = structuredClone(pluginConfig);
    invalid.environments.pilot.catalogUrl = "https://different.mockup-studio-cdn.com/v1/manifest.json";
    const invalidConfig = resolve(workDir, "invalid.json");
    await writeFile(invalidConfig, `${JSON.stringify(invalid, null, 2)}\n`);
    const rejected = spawnSync(process.execPath, [
      "scripts/build-plugin.mjs",
      "--mode", "pilot",
      "--config", invalidConfig,
      "--out-dir", resolve(workDir, "invalid-output")
    ], { cwd: projectRoot, encoding: "utf8" });
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /试运行构建必须与生产配置绑定同一精确 manifest/);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});

test("production builder rejects every development and placeholder identity by execution", async () => {
  const workDir = await mkdtemp(resolve(tmpdir(), "mockup-production-build-"));
  try {
    const validConfig = structuredClone(pluginConfig);
    validConfig.environments.production = {
      pluginId: "1234567890123456789",
      catalogUrl: "https://assets.mockupstudio.cn/v1/manifest.json",
      catalogEnvironment: "production"
    };

    async function runBuild(label, mutate) {
      const config = structuredClone(validConfig);
      mutate?.(config);
      const configPath = resolve(workDir, `${label}.json`);
      const outputPath = resolve(workDir, `output-${label}`);
      await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
      const result = spawnSync(process.execPath, [
        "scripts/build-plugin.mjs",
        "--mode", "production",
        "--config", configPath,
        "--out-dir", outputPath
      ], { cwd: projectRoot, encoding: "utf8" });
      return { result, outputPath };
    }

    const valid = await runBuild("valid");
    assert.equal(valid.result.status, 0, valid.result.stderr || valid.result.stdout);
    const [manifest, ui] = await Promise.all([
      readFile(resolve(valid.outputPath, "manifest.json"), "utf8").then(JSON.parse),
      readFile(resolve(valid.outputPath, "ui.html"), "utf8")
    ]);
    assert.equal(manifest.id, validConfig.environments.production.pluginId);
    assert.deepEqual(manifest.networkAccess.allowedDomains, ["https://assets.mockupstudio.cn"]);
    assert.equal(Object.hasOwn(manifest.networkAccess, "devAllowedDomains"), false);
    assert.match(ui, /REL-[A-F0-9]{12}/);
    assert.doesNotMatch(ui, /https?:\/\/(?:localhost|127\.0\.0\.1|[^/"']+\.(?:example|invalid|test))(?:[\/:"'])|DEV-[A-F0-9]+/);

    const invalidCases = [
      ["localhost", (config) => { config.environments.production.catalogUrl = "https://localhost/v1/manifest.json"; }],
      ["ip", (config) => { config.environments.production.catalogUrl = "https://127.0.0.1/v1/manifest.json"; }],
      ["ipv6", (config) => { config.environments.production.catalogUrl = "https://[::1]/v1/manifest.json"; }],
      ["reserved-test", (config) => { config.environments.production.catalogUrl = "https://assets.mockup-studio.test/v1/manifest.json"; }],
      ["documentation-domain", (config) => { config.environments.production.catalogUrl = "https://assets.example.com/v1/manifest.json"; }],
      ["documentation-domain-trailing-dot", (config) => { config.environments.production.catalogUrl = "https://assets.example.net./v1/manifest.json"; }],
      ["empty-id", (config) => { config.environments.production.pluginId = ""; }],
      ["zero-id", (config) => { config.environments.production.pluginId = "0000000000000000000"; }],
      ["wrong-environment", (config) => { config.environments.production.catalogEnvironment = "testing"; }]
    ];
    for (const [label, mutate] of invalidCases) {
      const { result } = await runBuild(label, mutate);
      assert.notEqual(result.status, 0, `${label} unexpectedly generated a production plugin`);
    }
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
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
  assert.doesNotMatch(uiHtml, /\/\*__CATALOG_CONTRACT__\*\//);
  assert.doesNotMatch(uiHtml, /\/\*__RESOURCE_LIMITS__\*\//);
  assert.doesNotMatch(uiHtml, /\/\*__BOUNDED_RESPONSE__\*\//);
  assert.doesNotMatch(uiHtml, /\/\*__USER_ERROR_POLICY__\*\//);
  assert.doesNotMatch(uiHtml, /<script\s+src=/i);
});

test("小鸟样机 brand identity is source-bound and embedded without external runtime assets", async () => {
  assert.equal(pluginManifest.name, "小鸟样机");
  assert.equal(brandContract.schemaVersion, 2);
  assert.deepEqual(brandContract.contexts.darkUi.usageSizes, [38, 44]);
  assert.deepEqual(brandContract.contexts.lightSurface.usageSizes, [44, 72, 128]);
  assert.notDeepEqual(brandContract.contexts.darkUi.featureColors, brandContract.contexts.lightSurface.featureColors);
  for (const featureName of Object.keys(brandContract.features)) {
    assert.equal(brandContract.contexts.darkUi.featureColors[featureName], "#FFFFFF");
    assert.equal(brandContract.contexts.lightSurface.featureColors[featureName], "#171717");
  }
  const brandCheck = spawnSync(process.execPath, ["scripts/generate-brand-assets.mjs", "--check"], { cwd: projectRoot, encoding: "utf8" });
  assert.equal(brandCheck.status, 0, brandCheck.stderr || brandCheck.stdout);
  const sourceMetadata = await sharp(brandLogoSource).metadata();
  const runtimeMetadata = await sharp(brandLogoBytes).metadata();
  const lightMetadata = await sharp(lightBrandLogoBytes).metadata();
  assert.equal(sourceMetadata.hasAlpha, true);
  assert.deepEqual([runtimeMetadata.width, runtimeMetadata.height, runtimeMetadata.hasAlpha], [512, 512, true]);
  assert.deepEqual([lightMetadata.width, lightMetadata.height, lightMetadata.hasAlpha], [512, 512, true]);
  const { data: logoPixels, info: logoInfo } = await sharp(brandLogoBytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { data: lightPixels } = await sharp(lightBrandLogoBytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let transparentPixels = 0;
  let redPixels = 0;
  for (let index = 0; index < logoPixels.length; index += 4) {
    const [red, green, blue, alpha] = logoPixels.subarray(index, index + 4);
    if (alpha <= 8) transparentPixels += 1;
    if (alpha >= 240 && red >= 190 && green <= 110 && blue <= 110) redPixels += 1;
  }
  assert.ok(transparentPixels > 10_000, "brand logo must keep a genuine transparent background");
  assert.ok(redPixels > 80_000, "brand logo must preserve the red bird body");
  const scale = logoInfo.width / brandContract.sourceSize.width;
  for (const [featureName, feature] of Object.entries(brandContract.features)) {
    const [sourceX, sourceY, sourceWidth, sourceHeight] = feature.region;
    const left = Math.floor(sourceX * scale);
    const top = Math.floor(sourceY * scale);
    const right = Math.ceil((sourceX + sourceWidth) * scale);
    const bottom = Math.ceil((sourceY + sourceHeight) * scale);
    let darkUiWhite = 0;
    let lightSurfaceDark = 0;
    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) {
        const index = (y * logoInfo.width + x) * 4;
        const [darkRed, darkGreen, darkBlue, darkAlpha] = logoPixels.subarray(index, index + 4);
        const [lightRed, lightGreen, lightBlue, lightAlpha] = lightPixels.subarray(index, index + 4);
        if (darkAlpha >= 180 && darkRed >= 225 && darkGreen >= 225 && darkBlue >= 225) darkUiWhite += 1;
        if (lightAlpha >= 180 && lightRed <= 55 && lightGreen <= 55 && lightBlue <= 55) lightSurfaceDark += 1;
      }
    }
    assert.ok(darkUiWhite > 500, `${featureName} must stay visibly white on the dark plugin surface`);
    assert.ok(lightSurfaceDark > 500, `${featureName} must stay visibly dark on light Community surfaces`);
  }
  assert.match(uiHtml, /<title>小鸟样机<\/title>/);
  assert.match(uiHtml, /class="window-brand"[^>]*aria-label="小鸟样机"/);
  assert.match(uiHtml, /class="brand-logo brand-logo-window"/);
  assert.match(uiHtml, /class="window-brand-name">小鸟样机<\/span>/);
  assert.match(uiHtml, /class="brand-space"/);
  assert.equal((uiHtml.match(/data:image\/png;base64,/g) || []).length, 1);
  assert.doesNotMatch(uiHtml, /brand-logo-(?:full|collapsed)/);
  assert.match(uiStyles, /\.brand-logo img\s*\{[^}]*object-fit:\s*contain/s);
  assert.doesNotMatch(uiStyles, /\.brand-logo img\s*\{[^}]*filter:/s);
  assert.match(uiStyles, /\.brand-logo-window\s*\{[^}]*38px[^}]*var\(--window-collapse-progress\)[^}]*6px/s);
  assert.match(uiStyles, /\.window-brand-name\s*\{[^}]*font-size:\s*14px[^}]*font-weight:\s*650/s);
  assert.doesNotMatch(uiHtml, /样机工作室|Mockup Studio/);
  assert.doesNotMatch(code, /样机工作室/);
  assert.doesNotMatch(uiHtml, /怪兽样机|熊猫样机|小鸟壁纸/);
  assert.doesNotMatch(code, /怪兽样机|熊猫样机|小鸟壁纸/);
  assert.doesNotMatch(uiScript, /怪兽样机|熊猫样机|小鸟壁纸/);
  assert.match(code, /小鸟样机导出/);
  assert.match(uiScript, /· 小鸟样机/);
  assert.match(buildScript, /brandLogoSha256/);
  assert.match(buildScript, /little-bird-mockup-logo-dark-ui\.png/);
  assert.match(buildScript, /replaceAll\("__BRAND_LOGO_DATA_URI__", brandLogoDataUri\)/);
});

test("built UI keeps a deterministic build fingerprint internal instead of exposing developer metadata", () => {
  assert.match(uiScript, /const BUILD_FINGERPRINT = "__BUILD_FINGERPRINT__"/);
  assert.match(uiScript, /document\.documentElement\.dataset\.buildFingerprint = BUILD_FINGERPRINT/);
  assert.match(uiScript, /document\.documentElement\.dataset\.pluginVersion = PLUGIN_VERSION/);
  assert.doesNotMatch(uiHtml, /id="versionLabel"|class="build-label"/);
  assert.doesNotMatch(uiStyles, /\.build-label/);
  assert.doesNotMatch(uiHtml, /__BUILD_FINGERPRINT__/);
  assert.match(uiHtml, /DEV-[A-F0-9]{12}/);
});

test("plugin owns one cancellable motion path for real collapse and expand states", () => {
  assert.match(code, /expanded:\s*\{ width: 820, height: 600 \}/);
  assert.match(code, /collapsed:\s*\{ width: 288, height: 64 \}/);
  assert.match(code, /const WINDOW_RESIZE_MOTION_MS = 240/);
  assert.match(code, /const WINDOW_RESIZE_FRAME_MS = 16/);
  assert.match(code, /function easeOutCubic/);
  assert.match(code, /function animateWindowResize/);
  assert.match(code, /type: "window-state-progress"/);
  assert.match(code, /currentWindowCollapseProgress/);
  assert.match(code, /const revision = \+\+windowResizeRevision/);
  assert.match(code, /if \(revision !== windowResizeRevision\) return/);
  assert.match(code, /figma\.ui\.resize\(width, height\)/);
  assert.doesNotMatch(code, /figma\.ui\.resize\(next\.width, next\.height\)/);
  assert.match(uiScript, /setWindowState\("collapsed"\)/);
  assert.match(uiScript, /setWindowState\("expanded"\)/);
  assert.match(uiScript, /function applyWindowTransitionProgress/);
  assert.match(uiScript, /message\.type === "window-state-progress"[\s\S]*applyWindowTransitionProgress\(message\.progress\)/);
  assert.match(uiScript, /message\.type === "window-state-applied"[\s\S]*applyWindowVisualState\(appliedState\)/);
  assert.match(uiScript, /\(collapsed \? elements\.expandButton : elements\.collapseButton\)\.focus\(\{ preventScroll: true \}\)/);
  assert.doesNotMatch(uiStyles, /html\.is-collapsed \.app-shell\s*\{[^}]*display:\s*none/s);
  assert.match(uiStyles, /--window-collapse-progress:\s*0/);
  assert.match(uiStyles, /\.collapsed-bar\s*\{[^}]*opacity:\s*var\(--window-collapse-progress\)/s);
  assert.match(uiStyles, /\.collapsed-bar\s*\{[^}]*height:\s*64px[^}]*justify-content:\s*flex-end/s);
  assert.match(uiStyles, /\.window-brand\s*\{[^}]*position:\s*absolute[^}]*left:\s*12px[^}]*top:\s*0/s);
  assert.match(uiStyles, /html:not\(\[data-window-transition\]\) \.modebar/);
  assert.match(uiHtml, /id="collapseButton"/);
  assert.match(uiHtml, /id="expandButton"/);
  assert.match(uiHtml, /id="collapseButton"[\s\S]*d="M8 3v5H3M16 3v5h5M21 16h-5v5M3 16h5v5"/);
  assert.match(uiHtml, /id="expandButton"[\s\S]*d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5"/);
  assert.doesNotMatch(uiHtml, /id="collapseButton"[\s\S]{0,220}d="M6 12h12"/);
});

test("visual system uses neutral Mockup-style controls without the old neon accent", () => {
  assert.doesNotMatch(uiStyles, /d8ff5c/i);
  assert.match(uiStyles, /\.asset-card\.active \.asset-card-visual\s*\{[^}]*border-color:\s*#e0dfe3/s);
  assert.match(uiHtml, /class="primary-group"/);
});

test("empty previews never invent or bake an unapproved interface design", () => {
  assert.doesNotMatch(rendererScript, /createDefaultDesign|grid = Math\.max|hero\.addColorStop/);
  assert.doesNotMatch(uiScript, /createDefaultDesign|randomHoverTilt/);
  assert.match(uiScript, /const renderDesign = state\.designImage;/);
  assert.match(uiScript, /插件不会代替您生成内容/);
  assert.match(uiScript, /const center = renderer\.bilinearPoint\(quad, 0\.5, 0\.5\)/);
  assert.match(uiHtml, /id="screenCta" aria-label="添加画面"/);
});

test("glass surfaces use one role-based material system without painted glare", () => {
  assert.match(uiStyles, /--material-glass-action-size:\s*44px/);
  assert.match(uiStyles, /--material-glass-action-fill:\s*rgb\(255 255 255 \/ 84%\)/);
  assert.match(uiStyles, /--material-glass-action-icon:\s*#111216/);
  assert.match(uiStyles, /\.material-glass-panel\s*\{[^}]*background-color:\s*var\(--material-glass-panel-fill\)[^}]*backdrop-filter:\s*blur\(var\(--material-glass-blur\)\) saturate\(var\(--material-glass-saturation\)\)/s);
  assert.match(uiStyles, /\.screen-cta\s*\{[^}]*width:\s*var\(--material-glass-action-size\)[^}]*height:\s*var\(--material-glass-action-size\)[^}]*background-color:\s*var\(--material-glass-action-fill\)[^}]*color:\s*var\(--material-glass-action-icon\)[^}]*backdrop-filter:\s*blur\(var\(--material-glass-blur\)\)/s);
  assert.match(uiStyles, /\.screen-cta \.screen-cta-icon\s*\{[^}]*width:\s*20px[^}]*stroke:\s*currentColor/s);
  assert.match(uiStyles, /\.screen-cta:focus-visible\s*\{[^}]*var\(--focus-contrast-dark\)[^}]*var\(--focus-contrast-light\)/s);
  assert.doesNotMatch(uiStyles, /\.screen-cta[^,{]*::(?:before|after)/);
  const glassRules = [...uiStyles.matchAll(/\.(?:screen-cta|material-glass-panel)[^{]*\{[^}]*\}/g)].map((match) => match[0]).join("\n");
  assert.doesNotMatch(glassRules, /gradient|text-shadow|inset|#07080aa3|#090a0db8/i);
  assert.match(uiHtml, /class="screen-cta" id="screenCta" aria-label="添加画面" aria-haspopup="dialog" aria-controls="sourcePopover" aria-expanded="false"/);
  assert.match(uiHtml, /class="screen-cta-icon"[^>]*aria-hidden="true"[^>]*focusable="false"/);
  assert.match(uiHtml, /class="category-menu material-glass-panel"/);
  assert.match(uiHtml, /class="source-popover material-glass-panel"/);
  assert.match(uiScript, /elements\.screenCta\.setAttribute\("aria-expanded", "true"\)/);
  assert.match(uiScript, /elements\.screenCta\.setAttribute\("aria-expanded", "false"\)/);
  assert.match(uiStyles, /\.screen-cta\.has-image, \.screen-cta\[aria-expanded="true"\]\s*\{[^}]*visibility:\s*hidden[^}]*opacity:\s*0[^}]*pointer-events:\s*none/s);
  assert.match(uiStyles, /@supports not \(\(backdrop-filter:[\s\S]*\.screen-cta\s*\{\s*background-color:\s*#fff/);
  assert.match(uiStyles, /prefers-reduced-transparency:\s*reduce[\s\S]*backdrop-filter:\s*none/);
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

test("narrow host windows keep toolbar hit targets from overlapping", () => {
  assert.match(uiStyles, /\.stage-panel \{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(uiStyles, /@media \(max-width: 560px\)/);
  assert.match(uiStyles, /html:not\(\[data-window-transition\]\) \.stage-title, html:not\(\[data-window-transition\]\) \.stage-context #replaceSourceButton, html:not\(\[data-window-transition\]\) \.zoom-label \{ display: none; \}/);
  assert.match(uiStyles, /html:not\(\[data-window-transition\]\) \.stage-tools-right \{ margin-left: auto; gap: 4px; \}/);
  assert.match(uiStyles, /html:not\(\[data-window-transition\]\) \.resolution-pill \{ display: none; \}/);
  assert.match(uiStyles, /html:not\(\[data-window-transition\]\) \.crop-toolbar \{ padding: 5px; gap: 4px; \}/);
  assert.match(uiStyles, /html:not\(\[data-window-transition\]\) \.crop-toolbar span \{ display: none; \}/);
});

test("continuous editing uses responsive preview rendering and a final-quality commit", () => {
  assert.match(rendererScript, /quality === "preview"/);
  assert.match(uiScript, /requestAnimationFrame/);
  assert.match(uiScript, /scheduleComposite\("preview"\)/);
  assert.match(uiScript, /control\.addEventListener\("change", renderFinalComposite\)/);
  assert.match(uiScript, /function renderOutputCanvas\(\)/);
  assert.match(uiScript, /const blob = await canvasBlob\(outputCanvas\)/);
  assert.match(uiScript, /renderFinalComposite\(\);\s*committed = true;[\s\S]*await playContentTransition\(requestSequence, hasTransitionSnapshot\)/);
  assert.match(uiScript, /const MAX_PREVIEW_RENDER_SCALE = 2/);
  assert.match(uiScript, /schedulePreviewResolutionCommit\(\)/);
});

test("one canonical editable frame owns rendering, overlay, pointer mapping and source transforms", () => {
  assert.match(rendererScript, /asset\.screen\.recommendedSize/);
  assert.doesNotMatch(uiHtml, /<option value="stretch">/);
  assert.match(uiHtml, /自动填满 · 不变形/);
  assert.match(uiHtml, /id="fitMode" type="hidden" value="cover"/);
  assert.match(rendererScript, /function screenPlane/);
  assert.match(rendererScript, /function baselineFrameForAspect/);
  assert.match(rendererScript, /function normalizeFrame/);
  assert.match(rendererScript, /function frameQuadOnSurface/);
  assert.match(rendererScript, /function contentGeometry/);
  assert.match(rendererScript, /function planePointToCanvas/);
  assert.match(rendererScript, /function canvasPointToPlane/);
  assert.match(rendererScript, /function viewportPointToCanvas/);
  assert.match(rendererScript, /function logicalPointToBackingStore/);
  assert.match(rendererScript, /function imageFrameForCover/);
  assert.match(rendererScript, /function constrainImageFrameToCover/);
  assert.match(rendererScript, /function surfaceQuadForFrameQuad/);
  assert.match(rendererScript, /function constrainFrameToBounds/);
  assert.match(rendererScript, /function resizeFrameFromHandle/);
  assert.match(rendererScript, /function resizeFrameWithinBounds/);
  assert.match(rendererScript, /function frameFitsWithinBounds/);
  assert.match(rendererScript, /function transformFrameBetweenFrames/);
  assert.match(rendererScript, /function createContentCanvas/);
  assert.match(rendererScript, /const renderQuad = geometry\?\.renderQuad \|\| surfaceQuad/);
  assert.match(rendererScript, /function screenApertureMask/);
  assert.match(rendererScript, /shapeContext\.roundRect\(0, 0, plane\.width, plane\.height, radii\)/);
  assert.match(rendererScript, /function screenApertureGeometry/);
  assert.match(rendererScript, /function screenApertureMetrics/);
  assert.match(rendererScript, /mode: "aperture-mask"/);
  assert.match(rendererScript, /source: "explicit-geometry"/);
  assert.doesNotMatch(rendererScript, /chromaSpillAlpha|screenCoverageMask|screenCoverageMetrics|preparedBaseImage/);
  assert.doesNotMatch(rendererScript, /underlapCanvas|underlapQuad|expandQuad/);
  assert.doesNotMatch(rendererScript, /createScreenCanvas\([^\n]+content\);/);
  assert.match(uiScript, /contentFrame:/);
  assert.match(uiScript, /imageFrame:/);
  assert.match(uiScript, /function editingBoundsFrame/);
  assert.match(uiScript, /renderer\.contentGeometry/);
  assert.match(uiScript, /return geometry \? geometry\.overlayQuad\.map/);
  assert.match(uiScript, /renderer\.viewportPointToCanvas/);
  assert.match(uiScript, /renderer\.canvasPointToPlane/);
  assert.match(uiScript, /content: state\.designImage \? \{ frame: state\.contentFrame, imageFrame: state\.imageFrame \}/);
  assert.match(uiScript, /renderer\.surfaceQuadForFrameQuad/);
  assert.match(uiScript, /renderer\.transformFrameBetweenFrames/);
  assert.match(uiScript, /renderer\.constrainFrameToBounds/);
  assert.match(uiScript, /renderer\.inverseBilinearPoint\(physicalQuad, candidate\)/);
  assert.match(uiScript, /renderer\.bilinearPoint\(\s*physicalQuad/);
  assert.doesNotMatch(uiScript, /constrainCoverAdjustments|cropGeometry/);
  assert.match(uiHtml, /id="recommendedSize"/);
  assert.doesNotMatch(uiStyles, /\.canvas-wrap canvas\s*\{[^}]*max-width/s);
});

test("physical aperture and user pixels remain separate explicit geometries", () => {
  const apertureSource = rendererScript.match(/function screenApertureMask[\s\S]*?\n  }\n\n  function screenApertureMetrics/)?.[0] || "";
  const compositeSource = rendererScript.match(/function renderComposite[\s\S]*?\n  }\n\n  global\.MockupRenderer/)?.[0] || "";
  assert.match(rendererScript, /function screenApertureMask\(asset, outputWidth = asset\.canvas\.width, outputHeight = asset\.canvas\.height\)/);
  assert.match(apertureSource, /const plane = screenPlane\(targetAspect\)/);
  assert.match(apertureSource, /shapeContext\.roundRect/);
  assert.match(apertureSource, /const aperture = screenApertureGeometry\(asset\)/);
  assert.match(apertureSource, /drawImageToQuad\(maskContext, shape, aperture\.quad, "final"\)/);
  assert.doesNotMatch(apertureSource, /expandQuad|screen\.bleed/);
  assert.doesNotMatch(apertureSource, /chromaKey/);
  assert.doesNotMatch(apertureSource, /getImageData|aperturePixels|dilatedAperture|offsetY = -2|offsetX = -2/);
  assert.doesNotMatch(rendererScript, /sourceCoverageGeometry|screenCoverageMask|screenCoverageMetrics/);
  assert.match(rendererScript, /drawImageToQuad\(maskContext, shape, aperture\.quad, "final"\)/);
  assert.doesNotMatch(rendererScript, /static-screen-v1|static-screen-v2|static-screen-v3/);
  assert.match(rendererScript, /const surfaceQuad = designQuad \|\| quad \|\| asset\.screen\.quad/);
  assert.match(compositeSource, /screenContext\.fillRect\(0, 0, logicalWidth, logicalHeight\)/);
  assert.match(compositeSource, /clipQuad\(screenContext, renderQuad\);\s*drawImageToQuad\(screenContext, screenCanvas, renderQuad, quality\)/);
  assert.doesNotMatch(compositeSource, /drawImageToQuad\(screenContext,[^\n]+(?:underlap|expand)/);
  assert.doesNotMatch(compositeSource, /underlapCanvas|underlapQuad|expandQuad/);
  assert.match(rendererScript, /const renderScaleX = canvas\.width \/ logicalWidth/);
  assert.match(rendererScript, /screenContext\.drawImage\(screenApertureMask\(asset, canvas\.width, canvas\.height\), 0, 0\)/);
  assert.match(rendererScript, /context\.transform\(a, b, c, d, e, f\)/);
  assert.doesNotMatch(rendererScript, /context\.setTransform\(a, b, c, d, e, f\)/);
  assert.match(uiScript, /canvas\.width = state\.selectedAsset\.canvas\.width/);
  assert.match(uiScript, /width: outputCanvas\.width/);
  assert.match(serverScript, /apertureMetrics\.source !== "explicit-geometry"/);
  assert.match(serverScript, /assertNoChromaSchema\(item\)/);
});

test("the design supports direct move, four-corner proportional resize and four-edge resize", () => {
  assert.match(uiScript, /function enableStageInteractions/);
  assert.match(uiScript, /elements\.stage\.addEventListener\("pointerdown"/);
  assert.match(uiScript, /\.design-scale-handle/);
  assert.match(uiScript, /pointOnScreenPlane/);
  assert.match(uiScript, /renderer\.resizeFrameWithinBounds/);
  assert.match(uiScript, /renderer\.transformFrameBetweenFrames/);
  assert.match(uiScript, /window\.addEventListener\("pointermove"/);
  assert.match(uiStyles, /\.design-drag-target\s*\{[^}]*cursor:\s*grab/s);
  assert.match(uiStyles, /\.design-editor\.is-selected \.design-drag-target[^}]*cursor:\s*move/s);
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
  assert.match(uiScript, /function resetCurrentMockup\(\)[\s\S]*restoreDefaultMockupState\(\)/);
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
  assert.match(uiScript, /kind: "stage-pan"/);
  assert.match(uiScript, /window\.addEventListener\("pointermove", \(event\) => \{\s*if \(!interaction \|\| interaction\.pointerId !== event\.pointerId\) return;/s);
});

test("content hit testing owns the first drag while stage panning stays on explicit navigation gestures", () => {
  assert.doesNotMatch(uiScript, /directPanThreshold|intent === "pending"|intent = "pan"/);
  assert.match(uiScript, /state\.designSelected = true;\s*updateDesignEditor\(\);/);
  assert.match(uiScript, /interaction\.kind === "content-move"[\s\S]*startContentFrame[\s\S]*transformFrameBetweenFrames/);
  assert.match(uiScript, /if \(dragTarget\) \{\s*beginContentEdit\(event, "move"\)/);
  assert.match(uiScript, /event\.button === 1 \|\| stageSpacePressed/);
  assert.match(uiScript, /function enableStageInteractions\(\)[\s\S]*pendingContentClick[\s\S]*CONTENT_DOUBLE_CLICK_MS[\s\S]*CONTENT_DOUBLE_CLICK_DISTANCE[\s\S]*enterCropMode\(\)/);
  assert.match(uiScript, /finished\.kind === "content-move"[\s\S]*finishContentClick\(finished, event\)/);
  assert.doesNotMatch(uiScript, /addEventListener\("dblclick"/);
  assert.match(uiHtml, /拖动裁切框移动 · 拖动圆点缩放/);
  assert.match(uiScript, /state\.cropMode \? "移动裁切框" : "移动画面"/);
});

test("catalog hover rotates only the inner visual once per pointer entry without changing the hit box", () => {
  const renderAssetGridSource = uiScript.slice(
    uiScript.indexOf("function renderAssetGrid"),
    uiScript.indexOf("function loadImage")
  );
  assert.match(uiStyles, /\.catalog-panel\s*\{[^}]*overflow:\s*hidden/s);
  assert.match(uiStyles, /--panel-pad:\s*16px/);
  assert.match(uiStyles, /\.asset-grid\s*\{[^}]*padding:\s*12px var\(--panel-pad\) 16px/s);
  assert.match(uiStyles, /\.recent-strip > div\s*\{[^}]*overflow-x:\s*auto[^}]*display:\s*flex[^}]*justify-content:\s*flex-start/s);
  assert.match(uiStyles, /\.recent-strip\s*\{[^}]*position:\s*absolute[^}]*inset:\s*auto 0 0/s);
  assert.match(uiStyles, /\.catalog-view\.has-recent \.asset-grid\s*\{[^}]*padding-bottom:\s*var\(--recent-overlay-size\)/s);
  assert.match(uiStyles, /--recent-thumb-size:\s*44px/);
  assert.match(uiStyles, /\.recent-item\s*\{[^}]*width:\s*var\(--recent-thumb-size\)[^}]*height:\s*var\(--recent-thumb-size\)/s);
  assert.match(uiStyles, /\.recent-item\s*\{[^}]*margin:\s*0[^}]*padding:\s*0/s);
  const cardInteractionStyles = uiStyles.match(/\.asset-card\s*\{[\s\S]*?\.asset-card\.active \.asset-card-visual\s*\{[^}]*\}/)?.[0] || "";
  assert.match(uiStyles, /\.asset-card\s*\{[^}]*--card-hover-rotation:\s*0deg/s);
  assert.doesNotMatch(uiStyles, /\.asset-card\s*\{[^}]*transform:/s);
  assert.match(uiStyles, /\.asset-card-visual\s*\{[^}]*pointer-events:\s*none[^}]*transform:\s*rotate\(0deg\)[^}]*transition:\s*transform/s);
  assert.match(uiStyles, /\.asset-card\.is-hovered \.asset-card-visual\s*\{[^}]*rotate\(var\(--card-hover-rotation\)\)/s);
  assert.doesNotMatch(uiStyles, /\.asset-card:hover:not\(\.active\) \.asset-card-visual/);
  assert.doesNotMatch(cardInteractionStyles, /\.asset-card\s*\{[^}]*translate\(|\.asset-card\s*\{[^}]*scale\(/s);
  assert.match(uiScript, /function enableAssetCardHover\(\)/);
  assert.match(uiScript, /addEventListener\("pointerover"/);
  assert.match(uiScript, /addEventListener\("pointerout"/);
  assert.doesNotMatch(uiScript.slice(uiScript.indexOf("function enableAssetCardHover"), uiScript.indexOf("function loadImage")), /pointermove/);
  assert.match(uiScript, /reducedMotionQuery\.matches/);
  assert.match(renderAssetGridSource, /const visual = document\.createElement\("span"\);\s*visual\.className = "asset-card-visual"/s);
  assert.match(renderAssetGridSource, /visual\.append\(image, footer\);\s*button\.appendChild\(visual\)/s);
  assert.match(renderAssetGridSource, /button\.setAttribute\("aria-label", item\.name\)/);
  assert.match(uiStyles, /\.asset-card\s*\{[^}]*width:\s*100%/s);
  assert.match(uiStyles, /\.asset-card\s*\{[^}]*aspect-ratio:\s*4 \/ 3/s);
  assert.match(uiStyles, /\.asset-card-visual\s*\{[^}]*width:\s*100%[^}]*height:\s*100%/s);
  assert.match(uiStyles, /\.asset-card footer span\s*\{[^}]*display:\s*none/);
  assert.doesNotMatch(uiStyles, /\.asset-card span\s*\{[^}]*display:\s*none/);
  assert.doesNotMatch(uiScript.slice(uiScript.indexOf("function renderRecentStrip"), uiScript.indexOf("function enableRecentScrolling")), /asset-card-visual/);
  assert.match(uiScript, /addEventListener\("animationend", \(\) => button\.classList\.remove\("is-entering"\)/);
  assert.doesNotMatch(uiScript, /asset-card[\s\S]{0,240}addEventListener\("pointermove"/s);
  assert.doesNotMatch(uiStyles.match(/@keyframes card-enter\s*\{[^}]*\}[^}]*\}/s)?.[0] || "", /translate|scale|rotate/);
  assert.match(uiScript, /\.slice\(0, 10\)/);
  assert.match(uiScript, /function enableRecentScrolling/);
  const recentScrollingSource = uiScript.slice(uiScript.indexOf("function enableRecentScrolling"), uiScript.indexOf("function filteredItems"));
  assert.doesNotMatch(recentScrollingSource, /pointerdown[\s\S]{0,320}setPointerCapture/);
  assert.match(recentScrollingSource, /pointermove[\s\S]*setPointerCapture/);
  assert.match(uiScript, /elements\.recentItems\.addEventListener\("click", selectAssetFromCatalogEvent\)/);
  assert.match(uiScript, /function locateSelectedAsset/);
  assert.match(uiScript, /state\.locatedAssetId = state\.selectedAsset\.id/);
  assert.match(uiScript, /if \(locatedIndex > 0\) items\.unshift\(\.\.\.items\.splice\(locatedIndex, 1\)\)/);
  assert.match(uiHtml, /id="locateCurrentAsset"/);
  assert.match(uiHtml, /class="catalog-count" id="catalogCount"[\s\S]*id="locateCurrentAsset"/);
  assert.match(uiStyles, /\.catalog-summary-primary\s*\{[^}]*width:\s*max-content[^}]*display:\s*inline-grid[^}]*grid-auto-flow:\s*column[^}]*grid-auto-columns:\s*max-content/s);
  assert.match(uiStyles, /\.catalog-count\s*\{[^}]*white-space:\s*nowrap/s);
  const locateLayoutRule = uiStyles.match(/\.catalog-summary-primary\s*\{[^}]*\}/s)?.[0] || "";
  assert.doesNotMatch(locateLayoutRule, /position:\s*(?:absolute|fixed)|\bleft:|margin-left:/);
});

test("catalog hover state is stable during dwell, resets on leave and resamples on re-entry", () => {
  const card = fakeAssetCard();
  const values = [0.2, 0, 0.8, 1];
  let calls = 0;
  const random = () => {
    calls += 1;
    return values.shift();
  };

  assert.equal(assetCardHover.enter(card, random), -1.8);
  assert.equal(card.style.getPropertyValue("--card-hover-rotation"), "-1.8deg");
  assert.equal(card.classList.contains("is-hovered"), true);
  assert.equal(calls, 2);

  assert.equal(assetCardHover.enter(card, random), -1.8);
  assert.equal(calls, 2);

  assetCardHover.leave(card);
  assert.equal(card.style.getPropertyValue("--card-hover-rotation"), "0deg");
  assert.equal(card.classList.contains("is-hovered"), false);
  assert.equal("hoverRotation" in card.dataset, false);

  assert.equal(assetCardHover.enter(card, random), 2.7);
  assert.equal(calls, 4);
  assert.equal(assetCardHover.crossedBoundary(card, { ownerCard: true }), false);
  assert.equal(assetCardHover.crossedBoundary(card, { ownerCard: false }), true);
});

test("the motion system is restrained, state-driven and reduced-motion safe", () => {
  assert.match(uiStyles, /--motion-fast:\s*120ms/);
  assert.match(uiStyles, /--motion-base:\s*180ms/);
  assert.match(uiStyles, /--motion-panel:\s*220ms/);
  assert.match(uiStyles, /--motion-spatial:\s*360ms/);
  assert.match(uiStyles, /--motion-content-swap:\s*280ms/);
  assert.match(uiStyles, /--ease-content-swap:\s*cubic-bezier\(\.4,\s*0,\s*\.6,\s*1\)/);
  assert.match(uiStyles, /--ease-out:\s*cubic-bezier\(\.22, 1, \.36, 1\)/);
  assert.match(uiStyles, /--ease-spatial:\s*cubic-bezier\(\.2, \.8, \.2, 1\)/);
  assert.match(uiStyles, /\.asset-card\.is-entering\s*\{[^}]*card-enter/s);
  assert.match(uiStyles, /\.canvas-wrap\.is-view-animating\s*\{[^}]*transition:\s*transform/s);
  assert.match(uiStyles, /prefers-reduced-motion:\s*reduce[\s\S]*animation:\s*none !important/s);
  assert.match(uiScript, /function setAnimatedVisibility/);
  assert.match(uiScript, /visibilityRevisions\.get\(element\) === revision/);
  assert.match(uiScript, /setAnimatedVisibility\(elements\.catalogView, mode === "catalog"\)/);
  assert.match(uiScript, /renderAssetGrid\(\{ animate: true \}\)/);
  assert.match(uiScript, /elements\.canvasWrap\.classList\.add\("is-content-switching"\)/);
  assert.match(uiHtml, /class="segment-indicator"/);
  assert.match(uiStyles, /\.catalog-segments\[data-active-filter="similar"\][^}]*translateX\(calc\(100% \+ 4px\)\)/s);
  assert.match(uiScript, /elements\.catalogSegments\.dataset\.activeFilter = nextFilter/);
  assert.match(uiHtml, /id="categoryMenu" role="listbox"/);
  assert.match(uiStyles, /\.category-menu\s*\{[^}]*translateY\(-6px\) scale\(\.985\)[^}]*transition:/s);
  assert.match(uiScript, /function openCategoryMenu/);
  assert.match(uiScript, /function closeCategoryMenu/);
  assert.doesNotMatch(uiStyles, /--ease-blur-(?:in|out)|--motion-optical|--ease-optical/);
  assert.doesNotMatch(uiStyles, /is-content-blurred|blur\(24px\)/);
  assert.match(uiHtml, /id="stage"[\s\S]*id="contentTransitionCanvas"[\s\S]*id="canvasWrap"/);
  assert.match(uiStyles, /\.content-transition-canvas\s*\{[^}]*position:\s*absolute[^}]*will-change:\s*filter, opacity, transform/s);
  assert.match(uiStyles, /\.stage\.is-content-transition-ready \.canvas-wrap > #previewCanvas\s*\{[^}]*opacity:\s*0[^}]*blur\(10px\)/s);
  assert.match(uiStyles, /\.stage\.is-content-transitioning \.content-transition-canvas\.is-active\s*\{[^}]*opacity:\s*0[^}]*blur\(10px\)[^}]*var\(--motion-content-swap\) var\(--ease-content-swap\)/s);
  assert.match(uiScript, /const CONTENT_TRANSITION_MS = 280/);
  assert.match(uiScript, /const STAGE_VIEW_MOTION_MS = 360/);
  assert.match(uiScript, /function waitForNextPaint\(\)[\s\S]*requestAnimationFrame\(\(\) => requestAnimationFrame\(resolve\)\)/);
  assert.match(uiScript, /function captureContentTransitionSnapshot\(\)[\s\S]*drawImage\(elements\.previewCanvas, 0, 0\)[\s\S]*classList\.add\("is-content-transition-ready"\)/);
  assert.match(uiScript, /function playContentTransition\(requestSequence, hasSnapshot\)[\s\S]*classList\.add\("is-content-transitioning"\)[\s\S]*waitForDuration\(CONTENT_TRANSITION_MS\)/);
  assert.doesNotMatch(uiScript, /CONTENT_BLUR_ENTER_MS|MIN_CONTENT_BLUR_MS|CONTENT_REVEAL_MS|is-content-blurred/);
  assert.match(uiScript, /function animateStageView[\s\S]*const wasAnimating = elements\.canvasWrap\.classList\.contains\("is-view-animating"\)[\s\S]*if \(!wasAnimating\) void elements\.canvasWrap\.offsetWidth[\s\S]*setTimeout\(stopStageViewAnimation, STAGE_VIEW_MOTION_MS\)/);
  assert.match(uiScript, /stopStageViewAnimation\(\);[\s\S]*elements\.stage\.addEventListener\("wheel"/s);
});

test("asset switches commit only after resources are ready and bound catalog warming", () => {
  const selectionSource = uiScript.slice(
    uiScript.indexOf("async function selectAsset"),
    uiScript.indexOf("function updateOutputAvailability")
  );
  assert.ok(selectionSource.indexOf("await loadAssetImages(asset)") < selectionSource.indexOf("state.selectedAsset = asset"));
  assert.match(selectionSource, /state\.selectedAsset = asset;[\s\S]*rememberRecent\(id\)/);
  assert.match(selectionSource, /renderFinalComposite\(\);[\s\S]*await playContentTransition\(requestSequence, hasTransitionSnapshot\)/);
  assert.doesNotMatch(selectionSource, /Promise\.all\(\[[\s\S]*waitForDuration/);
  assert.match(selectionSource, /已保留当前样机/);
  assert.match(uiScript, /const catalogImageCache = new Map\(\)/);
  assert.match(resourceLimitsScript, /MAX_CATALOG_IMAGE_CACHE_ENTRIES = 8/);
  assert.match(resourceLimitsScript, /MAX_CATALOG_PREFETCH_ASSETS = 3/);
  assert.match(uiScript, /resourceLimits\.writeLru\(catalogImageCache, cacheKey, request\)/);
  assert.match(uiScript, /resourceLimits\.nearestAssets\(items, state\.selectedAsset\?\.id\)/);
  assert.match(uiScript, /crypto\.subtle\.digest\("SHA-256", bytes\)/);
  assert.match(uiScript, /if \(!globalThis\.crypto\?\.subtle\) return sha256HexPortable\(bytes\)/);
  assert.match(uiScript, /actualSha256 !== expectedSha256/);
  assert.match(uiScript, /asset\.integrity\.baseSha256/);
  assert.match(uiScript, /asset\.integrity\.thumbnailSha256/);
  assert.doesNotMatch(uiScript, /for \(const asset of state\.manifest\.items\)[\s\S]*loadAssetImages\(asset\)/);
  assert.match(uiScript, /function scheduleCatalogPreload\(\)/);
  assert.match(serverScript, /max-age=31536000, immutable/);
});

test("portable SHA-256 preserves catalog integrity when the Figma iframe lacks SubtleCrypto", async () => {
  const start = uiScript.indexOf("function sha256HexPortable");
  const end = uiScript.indexOf("async function sha256Hex", start);
  assert.ok(start >= 0 && end > start, "portable SHA-256 implementation must be present");
  const portableSha256 = runInNewContext(
    `(() => { ${uiScript.slice(start, end)}; return sha256HexPortable; })()`,
    { Uint8Array, Uint32Array, DataView, Math }
  );
  for (const length of [0, 1, 55, 56, 63, 64, 65, 1024]) {
    const bytes = Uint8Array.from({ length }, (_, index) => (index * 37 + length) & 0xff);
    const expected = createHash("sha256").update(bytes).digest("hex");
    assert.equal(portableSha256(bytes), expected, `portable SHA-256 mismatch at ${length} bytes`);
  }
  const manifest = JSON.parse(await readFile(resolve(projectRoot, "catalog/testing/v1/manifest.json"), "utf8"));
  const asset = manifest.items[0];
  const assetBytes = await readFile(resolve(projectRoot, "catalog/testing/v1", asset.layers.base));
  assert.equal(portableSha256(assetBytes), asset.integrity.baseSha256);
});

test("runtime catalog contract rejects every production trust-boundary mismatch", async () => {
  const productionManifest = JSON.parse(await readFile(resolve(projectRoot, "catalog/production/v1/manifest.json"), "utf8"));
  const testingManifest = JSON.parse(await readFile(resolve(projectRoot, "catalog/testing/v1/manifest.json"), "utf8"));
  productionManifest.items = testingManifest.items.slice(0, 2).map((item, index) => ({
    ...structuredClone(item),
    status: "approved",
    qa: { approvedAt: "2026-10-31T05:00:00.000Z", rendererVersion: "2.4.0", sourceItemSha256: `${index + 1}`.repeat(64), reportSha256: "a".repeat(64), report: `approvals/${item.id}-r2.json` },
    release: { decidedAt: "2026-10-31T05:01:00.000Z", actor: { type: "human", identity: "Wang Zhentao" }, sourceItemSha256: `${index + 1}`.repeat(64), qaReportSha256: "a".repeat(64), reportSha256: "b".repeat(64), report: `release-approvals/${item.id}-r2.json` }
  }));
  productionManifest.publishedAt = "2026-10-31T05:30:00.000Z";
  const expected = {
    schemaVersion: 5,
    environment: "production",
    rendererVersion: "2.4.0",
    pluginVersion: "0.1.0",
    maxItems: 500,
    currentTime: Date.parse("2026-10-31T14:00:00+08:00")
  };
  assert.equal(catalogContract.validateManifest(productionManifest, expected, renderer.validateAsset), productionManifest);

  const mutations = [
    ["environment", (manifest) => { manifest.environment = "testing"; }, /环境/],
    ["schema", (manifest) => { manifest.schemaVersion = 3; }, /版本/],
    ["renderer", (manifest) => { manifest.rendererVersion = "9.9.9"; }, /渲染器/],
    ["minimum plugin", (manifest) => { manifest.minimumPluginVersion = "9.0.0"; }, /更新版本/],
    ["future publish time", (manifest) => { manifest.publishedAt = "2027-01-01T00:00:00.000Z"; }, /发布时间/],
    ["status", (manifest) => { manifest.items[0].status = "testing"; }, /状态/],
    ["provenance", (manifest) => { manifest.items[0].provenance.kind = "unknown"; }, /可信来源/],
    ["base hash", (manifest) => { manifest.items[0].integrity.baseSha256 = "0"; }, /完整性摘要/],
    ["qa", (manifest) => { delete manifest.items[0].qa; }, /质检记录/],
    ["duplicate id", (manifest) => { manifest.items[1].id = manifest.items[0].id; }, /ID 无效或重复/],
    ["absolute asset path", (manifest) => { manifest.items[0].layers.base = "https://evil.example/base.png"; }, /目录内相对路径/],
    ["traversal asset path", (manifest) => { manifest.items[0].thumbnail = "../outside.png"; }, /目录内相对路径/],
    ["item limit", (manifest) => { manifest.items = Array.from({ length: 501 }, (_, index) => ({ ...manifest.items[0], id: `copy-${index}` })); }, /数量超过/]
  ];
  for (const [label, mutate, message] of mutations) {
    const manifest = structuredClone(productionManifest);
    mutate(manifest);
    assert.throws(() => catalogContract.validateManifest(manifest, expected, renderer.validateAsset), message, label);
  }

  assert.match(uiScript, /catalogContract\.validateManifest/);
  assert.match(uiScript, /value\.catalogBaseUrl !== ACTIVE_CATALOG_URL/);
  assert.match(uiScript, /cacheAge > MAX_OFFLINE_CATALOG_AGE_MS/);
  assert.match(uiScript, /validateCachedCatalog\(message\.cache\)/);
  assert.match(uiScript, /boundedResponse\.readBoundedResponse\(response, MAX_CATALOG_MANIFEST_BYTES/);
  assert.match(uiScript, /boundedResponse\.readBoundedResponse\(response, MAX_CATALOG_ASSET_BYTES/);
  assert.match(boundedResponseScript, /reader\.cancel/);
});

test("Figma and local sources flatten to one static design object", () => {
  assert.match(code, /type:\s*"selection-composite"/);
  assert.match(code, /Figma 组合/);
  assert.match(uiScript, /composeSelectionLayers/);
  assert.match(uiScript, /importVideoFile/);
  assert.match(uiScript, /importPdfFile/);
  assert.match(uiHtml, /application\/pdf/);
});

test("catalog search combines semantic keywords, explicit category and similar scope without false empty results", async () => {
  const start = uiScript.indexOf("const SEARCH_CONCEPTS");
  const end = uiScript.indexOf("function filteredItems", start);
  assert.ok(start >= 0 && end > start, "catalog search model must be independently testable");
  const catalogSearch = runInNewContext(
    `(() => { ${uiScript.slice(start, end)}; return { filterCatalogItems }; })()`,
    { Map, Set, String, Object }
  );
  const categories = [
    { id: "phone", label: "手机" },
    { id: "display", label: "显示器" },
    { id: "laptop", label: "笔记本" }
  ];
  const items = [
    { id: "phone-front", name: "岩石手机 · 正面", category: "phone", tags: ["手机", "phone"] },
    { id: "phone-angle", name: "支架手机 · 倾斜", category: "phone", tags: ["手机", "phone"] },
    { id: "display-front", name: "工作室显示器 · 正面", category: "display", tags: ["显示器", "monitor"] },
    { id: "laptop-angle", name: "石墨笔记本 · 倾斜", category: "laptop", tags: ["笔记本", "laptop"] }
  ];

  assert.deepEqual(
    [...catalogSearch.filterCatalogItems({ items, categories, query: "电脑", category: "laptop", segment: "similar", selectedCategory: "display" })].map((item) => item.id),
    ["laptop-angle"]
  );
  assert.deepEqual(
    [...catalogSearch.filterCatalogItems({ items, categories, query: "", category: "laptop", segment: "similar", selectedCategory: "phone" })].map((item) => item.id),
    ["laptop-angle"]
  );
  assert.deepEqual(
    [...catalogSearch.filterCatalogItems({ items, categories, query: "", category: "all", segment: "similar", selectedCategory: "phone" })].map((item) => item.id),
    ["phone-front", "phone-angle"]
  );
  assert.deepEqual(
    [...catalogSearch.filterCatalogItems({ items, categories, query: "电脑 正面", category: "all", segment: "all", selectedCategory: "phone" })].map((item) => item.id),
    ["display-front"]
  );
  assert.equal(catalogSearch.filterCatalogItems({ items, categories, query: "相机", category: "all", segment: "all", selectedCategory: "phone" }).length, 0);
  const productionCatalog = JSON.parse(await readFile(resolve(projectRoot, "catalog/production/v1/manifest.json"), "utf8"));
  assert.deepEqual(
    [...catalogSearch.filterCatalogItems({
      items: productionCatalog.items,
      categories: productionCatalog.categories,
      query: "电脑",
      category: "laptop",
      segment: "similar",
      selectedCategory: "display"
    })].map((item) => item.id),
    ["graphite-laptop-angle"]
  );
  assert.match(uiScript, /const requiredCategory = explicitCategory \|\| \(segment === "similar" \? selectedCategory : null\)/);
});

test("one editor owns selection crop perspective and constant-size handles", () => {
  assert.doesNotMatch(uiHtml, /id="perspectiveEditor"|id="designEditorHint"/);
  assert.match(uiStyles, /--overlay-inverse-scale/);
  assert.match(uiStyles, /\.crop-toolbar/);
  assert.match(uiHtml, /id="cropShade"/);
  assert.match(uiScript, /enterCropMode/);
  assert.match(uiScript, /state\.cropSnapshot = editorSnapshot\(\)/);
  assert.match(uiScript, /const cropPath = framePath\(points\)/);
  assert.match(uiScript, /elements\.cropFrame\.setAttribute\("d", cropPath\)/);
  assert.match(uiScript, /renderer\.resizeFrameWithinBounds/);
  assert.match(uiScript, /state\.imageFrame = state\.cropMode\s*\? \{ \.\.\.interaction\.startImageFrame \}/);
  assert.match(uiScript, /state\.contentFrame = resizedContent/);
  assert.match(uiStyles, /\.design-editor\.is-cropping \.crop-shade/);
  assert.match(uiScript, /state\.mode === "perspective" \|\| event\.metaKey \|\| event\.ctrlKey/);
  assert.match(uiScript, /function undoEditor/);
  assert.match(uiScript, /function redoEditor/);
  assert.match(rendererScript, /const surfaceQuad = designQuad \|\| quad \|\| asset\.screen\.quad/);
  assert.match(rendererScript, /contentGeometry\(designImage, targetAspect, surfaceQuad, content\.frame, content\.imageFrame\)/);
  assert.match(rendererScript, /const renderQuad = geometry\?\.renderQuad \|\| surfaceQuad/);
  assert.match(rendererScript, /clipQuad\(screenContext, renderQuad\)/);
  assert.match(rendererScript, /context\.rect\(0, 0, frame\.width, frame\.height\)/);
  assert.doesNotMatch(rendererScript.match(/function createContentCanvas[\s\S]*?\n  }\n\n  function drawImageToQuad/)?.[0] || "", /roundRect|cornerRadii/);
  assert.match(uiHtml, /id="designScale" type="range" min="100" max="400"/);
  assert.match(uiScript, /state\.imageFrame = renderer\.imageFrameFromAdjustments/);
  assert.match(uiScript, /state\.adjustments = renderer\.adjustmentsFromImageFrame/);
});

test("preview and QA surfaces preserve the source image's real square outer boundary", async () => {
  assert.match(uiStyles, /\.canvas-wrap\s*\{[^}]*border-radius:\s*0/s);
  assert.doesNotMatch(uiStyles, /\.design-scale-handle::before/);
  assert.match(uiStyles, /\.design-scale-handle\s*\{[^}]*width:\s*20px[^}]*height:\s*20px/s);
  assert.match(await readFile(resolve(projectRoot, "asset-lab/styles.css"), "utf8"), /\.canvas-wrap\s*\{[^}]*border-radius:\s*0/s);
});

test("content lifecycle is routed through one keyboard command layer with reversible removal", () => {
  assert.match(uiScript, /const EDITOR_COMMANDS = Object\.freeze/);
  assert.match(uiScript, /function executeEditorCommand\(command\)/);
  assert.match(uiScript, /function keyboardEditorCommand\(event\)/);
  assert.match(uiScript, /event\.key === "Backspace" \|\| event\.key === "Delete"/);
  assert.match(uiScript, /state\.designImage && state\.designSelected \? EDITOR_COMMANDS\.removeContent : null/);
  assert.match(uiScript, /commandModifier && key === "z"/);
  assert.match(uiScript, /commandModifier && key === "y"/);
  assert.match(uiScript, /function removeDesign\(\)[\s\S]*pushHistory\(\)[\s\S]*state\.designImage = null[\s\S]*return true/s);
  assert.match(uiScript, /function removeDesign\(\)[\s\S]*restoreDefaultMockupState\(\{ clearContentGeometry: true \}\)/s);
  assert.match(uiScript, /function restoreDefaultMockupState\([\s\S]*state\.adjustments = \{ \.\.\.DEFAULT_ADJUSTMENTS \}[\s\S]*state\.crop = \{ \.\.\.DEFAULT_CROP \}[\s\S]*state\.customQuad = state\.selectedAsset\.screen\.quad[\s\S]*state\.contentFrame = null[\s\S]*state\.imageFrame = null[\s\S]*state\.designSelected = false[\s\S]*state\.cropHistoryDepth = 0/s);
  assert.match(uiScript, /function resetCurrentMockup\(\)[\s\S]*restoreDefaultMockupState\(\)/s);
  assert.match(uiScript, /designSelected: state\.designSelected/);
  assert.match(uiScript, /state\.designSelected = Boolean\(snapshot\.designSelected && snapshot\.designImage\)/);
  assert.match(uiScript, /elements\.fitMode\.value = snapshot\.fit \|\| "cover"/);
  assert.doesNotMatch(uiScript, /function clearDesign\(/);
});

test("plugin and asset lab use one shared renderer and one catalog schema", () => {
  assert.match(rendererScript, /const VERSION = "2\.4\.0"/);
  assert.match(labHtml, /src="\/shared\/mockup-renderer\.js"/);
  assert.match(labScript, /renderer\.renderComposite/);
  assert.match(labScript, /renderer\.screenApertureMetrics/);
  assert.match(serverScript, /catalog\/testing\/v1/);
  assert.match(serverScript, /\/api\/lab\/approve/);
  assert.match(serverScript, /\/api\/lab\/geometry/);
});

test("irrelevant paid-only filtering is removed", () => {
  assert.doesNotMatch(uiHtml, /仅免费|id="freeOnly"/);
  assert.doesNotMatch(uiScript, /freeOnly/);
});

test("search has one explicit clear action without a native search cancel control", () => {
  assert.match(uiHtml, /role="search"/);
  assert.match(uiHtml, /id="searchInput" type="text" aria-label="搜索样机"/);
  assert.doesNotMatch(uiHtml, /<label class="search-field">/);
  assert.equal((uiHtml.match(/id="clearSearch"/g) || []).length, 1);
  assert.match(uiStyles, /\[role="button"\]:focus-visible/);
});

test("remote catalog is data-only and does not execute fetched JavaScript", () => {
  assert.match(uiScript, /JSON\.parse\(new TextDecoder\("utf-8", \{ fatal: true \}\)\.decode\(manifestBytes\)\)/);
  assert.doesNotMatch(uiScript, /eval\s*\(/);
  assert.doesNotMatch(uiScript, /new Function\s*\(/);
});

test("catalog deployment publishes only data with immutable assets and uncached manifest", () => {
  assert.match(netlifyConfig, /command\s*=\s*"pnpm netlify:catalog:prepare"/);
  assert.match(netlifyConfig, /publish\s*=\s*"dist\/netlify-catalog"/);
  assert.doesNotMatch(netlifyConfig, /publish\s*=\s*"catalog\/production"/);
  assert.match(netlifyConfig, /Access-Control-Allow-Origin\s*=\s*"\*"/);
  assert.match(gitignore, /^\.netlify\/$/m);
});
