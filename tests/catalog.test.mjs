import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const testingRoot = resolve(projectRoot, "catalog/testing/v1");
const productionRoot = resolve(projectRoot, "catalog/production/v1");
const testing = JSON.parse(await readFile(resolve(testingRoot, "manifest.json"), "utf8"));
const production = JSON.parse(await readFile(resolve(productionRoot, "manifest.json"), "utf8"));

test("testing and production catalogs share schema v3 with separate aperture geometry", () => {
  assert.equal(testing.schemaVersion, 3);
  assert.equal(production.schemaVersion, 3);
  assert.equal(testing.environment, "testing");
  assert.equal(production.environment, "production");
  assert.equal(testing.rendererVersion, "2.2.0");
  assert.equal(production.rendererVersion, "2.2.0");
  assert.equal(testing.items.length, 4, "the functional closure is intentionally limited to four temporary mockups");
  for (const manifest of [testing, production]) {
    assert.match(manifest.catalogVersion, /^\d{4}\.\d{2}\.\d{2}\.\d+$/);
    const ids = manifest.items.map((item) => item.id);
    assert.equal(new Set(ids).size, ids.length);
  }
});

async function verifyCatalog(manifest, catalogRoot, expectedStatus) {
  for (const item of manifest.items) {
    assert.equal(item.renderer, "static-screen-v3");
    assert.equal(item.status, expectedStatus);
    assert.equal(item.provenance.kind, "generated-in-house");
    assert.ok(item.canvas.width > 0);
    assert.ok(item.canvas.height > 0);
    assert.ok(item.screen.recommendedSize.width > 0);
    assert.ok(item.screen.recommendedSize.height > 0);
    assert.ok(item.screen.recommendedSize.label);
    assert.ok(["cover", "contain"].includes(item.screen.defaultFit));
    assert.equal(item.screen.quad.length, 4);
    for (const [x, y] of item.screen.quad) {
      assert.ok(x >= 0 && x <= item.canvas.width, `${item.id} x coordinate is outside canvas`);
      assert.ok(y >= 0 && y <= item.canvas.height, `${item.id} y coordinate is outside canvas`);
    }
    assert.equal(item.screen.aperture.quad.length, 4);
    assert.equal(item.screen.aperture.cornerRadii.length, 4);
    assert.ok(item.screen.aperture.cornerRadii.every((radius) => radius >= 0 && radius <= 0.49));
    assert.equal(Object.hasOwn(item.screen, "cornerRadius"), false, `${item.id} must not retain the ambiguous legacy radius`);

    const assetPath = resolve(catalogRoot, item.layers.base);
    const thumbnailPath = resolve(catalogRoot, item.thumbnail);
    const [assetBytes, thumbnailBytes] = await Promise.all([readFile(assetPath), readFile(thumbnailPath)]);
    assert.equal(createHash("sha256").update(assetBytes).digest("hex"), item.integrity.baseSha256);
    assert.equal(createHash("sha256").update(thumbnailBytes).digest("hex"), item.integrity.thumbnailSha256);
    assert.match(item.layers.base, /-r\d+\.[a-z0-9]+$/i, "asset filenames must be revisioned");
    assert.match(item.thumbnail, /-r\d+\.[a-z0-9]+$/i, "thumbnail filenames must be revisioned");
  }
}

test("every testing mockup has valid geometry and immutable source assets", async () => {
  await verifyCatalog(testing, testingRoot, "testing");
});

test("production contains only promoted approved mockups", async () => {
  await verifyCatalog(production, productionRoot, "approved");
  for (const item of production.items) {
    assert.ok(item.qa?.approvedAt);
    assert.equal(item.qa?.rendererVersion, production.rendererVersion);
    const report = JSON.parse(await readFile(resolve(productionRoot, item.qa.report), "utf8"));
    assert.equal(report.status, "approved");
    assert.equal(report.assetId, item.id);
    assert.equal(report.revision, item.revision);
    assert.equal(report.rendererVersion, production.rendererVersion);
    assert.equal(report.itemSha256, item.qa.sourceItemSha256);
  }
});

