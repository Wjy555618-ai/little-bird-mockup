import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { activeRuntimeFiles, prepareNetlifyCatalogCandidate, verifyNetlifyCatalogCandidate } from "../scripts/lib/netlify-catalog-candidate.mjs";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

test("Netlify candidate publishes only the active runtime catalog and excludes historical or control-plane files", async () => {
  const temporaryRoot = await mkdtemp(resolve(tmpdir(), "mockup-netlify-candidate-"));
  const outputRoot = resolve(temporaryRoot, "catalog");
  try {
    const manifest = JSON.parse(await readFile(resolve(projectRoot, "catalog/production/v1/manifest.json"), "utf8"));
    const result = await prepareNetlifyCatalogCandidate({ projectRoot, outputRoot });
    const expected = [...activeRuntimeFiles(manifest), "_headers"].sort();
    const activeMedia = new Set(expected.filter((path) => path.startsWith("v1/assets/") || path.startsWith("v1/thumbnails/")));
    assert.deepEqual(result.files, expected);
    assert.equal(result.itemCount, manifest.items.length);
    assert.ok(result.files.every((path) => !path.includes("approvals/") && !path.includes("workflow/")));
    assert.ok(result.files.filter((path) => path.startsWith("v1/assets/") || path.startsWith("v1/thumbnails/")).every((path) => activeMedia.has(path)));
    assert.ok(result.files.every((path) => path === "_headers" || path === "v1/manifest.json" || /\.(?:png|jpe?g|webp)$/i.test(path)));
    const verified = await verifyNetlifyCatalogCandidate({ projectRoot, outputRoot });
    assert.deepEqual(verified.files, expected);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
