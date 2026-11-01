import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const projectRoot = new URL("..", import.meta.url);

test("v5 迁移可重复检查且所有活动引用均受当前流水线治理", async () => {
  const { stdout } = await execFileAsync(process.execPath, ["scripts/migrate-chroma-catalog-v5.mjs", "--check"], { cwd: projectRoot });
  assert.match(stdout, /zero-chroma migration OK/);
  const testing = JSON.parse(await readFile(new URL("../catalog/testing/v1/manifest.json", import.meta.url), "utf8"));
  const production = JSON.parse(await readFile(new URL("../catalog/production/v1/manifest.json", import.meta.url), "utf8"));
  assert.equal(testing.schemaVersion, 5);
  assert.equal(testing.rendererVersion, "2.4.0");
  assert.ok(testing.items.length >= 5);
  assert.ok(production.items.length <= testing.items.length);
  const testingById = new Map(testing.items.map((item) => [item.id, item]));
  for (const item of [...testing.items, ...production.items]) {
    assert.ok(item.revision >= 1);
    assert.equal(item.renderer, "static-screen-v5");
    assert.equal(item.screen.compositing.mode, "aperture-mask");
    assert.equal(Object.hasOwn(item, "chromaKey"), false);
    assert.equal(Object.hasOwn(item.screen, "underlap"), false);
    assert.match(item.layers.base, new RegExp(`-r${item.revision}\\.png$`));
  }
  const governed = testing.items.filter((item) => item.provenance?.migrationFrom || item.provenance?.pipelinePolicyId === "MOCKUP-ASSET-PIPELINE-1");
  assert.equal(governed.length, testing.items.length);
  const migrated = testing.items.filter((item) => item.provenance?.migrationFrom);
  for (const item of migrated) assert.ok(item.revision > item.provenance.migrationFrom.revision);
  for (const item of production.items) {
    const candidate = testingById.get(item.id);
    assert.ok(candidate, `${item.id} 必须来自当前测试库候选`);
    assert.equal(item.revision, candidate.revision);
    assert.equal(item.integrity.baseSha256, candidate.integrity.baseSha256);
    assert.equal(item.status, "approved");
    assert.equal(item.release?.actor?.type, "human");
    assert.equal(item.release?.sourceItemSha256, item.qa?.sourceItemSha256);
  }
});
