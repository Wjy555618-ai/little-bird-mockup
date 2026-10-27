import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const pluginRoot = resolve(projectRoot, "plugin");
const [pluginManifest, code, uiScript, uiHtml] = await Promise.all([
  readFile(resolve(pluginRoot, "manifest.json"), "utf8").then(JSON.parse),
  readFile(resolve(pluginRoot, "code.js"), "utf8"),
  readFile(resolve(pluginRoot, "ui.js"), "utf8"),
  readFile(resolve(pluginRoot, "ui.html"), "utf8")
]);

test("plugin uses a fixed production domain and a development-only local catalog", () => {
  assert.deepEqual(pluginManifest.networkAccess.allowedDomains, ["https://assets.mockup-studio.example"]);
  assert.deepEqual(pluginManifest.networkAccess.devAllowedDomains, ["http://localhost:4173"]);
  assert.match(uiScript, /PRODUCTION_CATALOG_URL/);
  assert.match(uiScript, /DEVELOPMENT_CATALOG_URL/);
});

test("built UI contains the intended product modes without external scripts", () => {
  for (const label of ["静态样机", "动态样机", "3D 工作室", "弯曲", "透视变形"]) {
    assert.match(uiHtml, new RegExp(label));
  }
  assert.doesNotMatch(uiHtml, /\/\*__STYLES__\*\//);
  assert.doesNotMatch(uiHtml, /\/\*__SCRIPT__\*\//);
  assert.doesNotMatch(uiHtml, /<script\s+src=/i);
});

test("the real vertical slice exports selection and writes rendered bytes back", () => {
  assert.match(code, /exportAsync/);
  assert.match(code, /figma\.createImage\(message\.bytes\)/);
  assert.match(code, /figma\.currentPage\.appendChild/);
  assert.match(code, /figma\.clientStorage\.setAsync/);
  assert.match(uiScript, /drawImageToQuad/);
  assert.match(uiScript, /paste-render/);
});

test("remote catalog is data-only and does not execute fetched JavaScript", () => {
  assert.match(uiScript, /response\.json\(\)/);
  assert.doesNotMatch(uiScript, /eval\s*\(/);
  assert.doesNotMatch(uiScript, /new Function\s*\(/);
});
