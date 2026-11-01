import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const source = await readFile(resolve(projectRoot, "shared/resource-limits.js"), "utf8");
const host = {};
runInNewContext(source, { window: host, Map, TypeError, RangeError, Object });
const limits = host.MockupResourceLimits;

test("500 unique catalog resources remain bounded to the newest eight entries", () => {
  const cache = new Map();
  for (let index = 0; index < 500; index += 1) limits.writeLru(cache, `asset-${index}`, index);
  assert.equal(cache.size, limits.MAX_CATALOG_IMAGE_CACHE_ENTRIES);
  assert.deepEqual([...cache.keys()], ["asset-492", "asset-493", "asset-494", "asset-495", "asset-496", "asset-497", "asset-498", "asset-499"]);

  assert.equal(limits.readLru(cache, "asset-492"), 492);
  limits.writeLru(cache, "asset-500", 500);
  assert.equal(cache.size, 8);
  assert.equal(cache.has("asset-492"), true, "a cache hit must refresh recency");
  assert.equal(cache.has("asset-493"), false, "the least recently used entry must be evicted");
});

test("failed requests cannot delete a newer request for the same resource", () => {
  const cache = new Map();
  const oldRequest = { id: "old" };
  const newRequest = { id: "new" };
  limits.writeLru(cache, "same-key", oldRequest);
  limits.writeLru(cache, "same-key", newRequest);
  limits.deleteIfSame(cache, "same-key", oldRequest);
  assert.equal(cache.get("same-key"), newRequest);
  limits.deleteIfSame(cache, "same-key", newRequest);
  assert.equal(cache.has("same-key"), false);
});

test("a 500-item catalog prefetches only three nearest assets", () => {
  const items = Array.from({ length: 500 }, (_, index) => ({ id: `asset-${index}` }));
  assert.deepEqual(
    limits.nearestAssets(items, "asset-250").map((asset) => asset.id),
    ["asset-249", "asset-251", "asset-248"]
  );
  assert.deepEqual(
    limits.nearestAssets(items, "asset-0").map((asset) => asset.id),
    ["asset-1", "asset-2", "asset-3"]
  );
  assert.equal(limits.nearestAssets(items, "asset-250").length, limits.MAX_CATALOG_PREFETCH_ASSETS);
});

test("invalid cache and prefetch limits fail closed", () => {
  assert.throws(() => limits.writeLru(new Map(), "key", "value", 0), /正整数/);
  assert.throws(() => limits.nearestAssets([], "missing", -1), /非负整数/);
  assert.throws(() => limits.writeLru({}, "key", "value"), /必须是 Map/);
});
