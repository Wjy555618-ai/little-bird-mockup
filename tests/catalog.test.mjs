import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const catalogRoot = resolve(projectRoot, "catalog/v1");
const manifest = JSON.parse(await readFile(resolve(catalogRoot, "manifest.json"), "utf8"));

test("catalog schema is versioned and has unique asset ids", () => {
  assert.equal(manifest.schemaVersion, 1);
  assert.match(manifest.catalogVersion, /^\d{4}\.\d{2}\.\d{2}\.\d+$/);
  assert.ok(manifest.items.length > 0);
  const ids = manifest.items.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("every static mockup has valid canvas, quad and immutable source asset", async () => {
  for (const item of manifest.items) {
    assert.equal(item.renderer, "static-screen-v1");
    assert.ok(item.canvas.width > 0);
    assert.ok(item.canvas.height > 0);
    assert.equal(item.screen.quad.length, 4);
    for (const [x, y] of item.screen.quad) {
      assert.ok(x >= 0 && x <= item.canvas.width, `${item.id} x coordinate is outside canvas`);
      assert.ok(y >= 0 && y <= item.canvas.height, `${item.id} y coordinate is outside canvas`);
    }

    const assetPath = resolve(catalogRoot, item.layers.base);
    const thumbnailPath = resolve(catalogRoot, item.thumbnail);
    const [assetBytes, thumbnailBytes] = await Promise.all([readFile(assetPath), readFile(thumbnailPath)]);
    assert.equal(createHash("sha256").update(assetBytes).digest("hex"), item.integrity.baseSha256);
    assert.equal(createHash("sha256").update(thumbnailBytes).digest("hex"), item.integrity.thumbnailSha256);
    assert.match(item.layers.base, /-r\d+\.[a-z0-9]+$/i, "asset filenames must be revisioned");
    assert.match(item.thumbnail, /-r\d+\.[a-z0-9]+$/i, "thumbnail filenames must be revisioned");
  }
});

