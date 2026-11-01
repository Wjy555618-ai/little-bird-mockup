import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { createHash } from "node:crypto";
import { copyImmutableFile, rollbackCatalog, snapshotCatalog, snapshotCatalogManifest, verifyCatalogHistory } from "../scripts/lib/catalog-history.mjs";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function projectFixture() {
  const root = await mkdtemp(resolve(tmpdir(), "mockup-catalog-history-"));
  const activeRoot = resolve(root, "catalog/production/v1");
  await mkdir(resolve(activeRoot, "assets"), { recursive: true });
  const asset = Buffer.from("immutable asset");
  await writeFile(resolve(activeRoot, "assets/example-r1.png"), asset);
  const manifest = {
    schemaVersion: 4,
    catalogVersion: "2026.10.30.1",
    publishedAt: "2026-10-30T00:00:00.000Z",
    environment: "production",
    rendererVersion: "2.3.0",
    items: [{
      id: "example",
      thumbnail: "assets/example-r1.png",
      layers: { base: "assets/example-r1.png" },
      integrity: { thumbnailSha256: sha256(asset), baseSha256: sha256(asset) }
    }]
  };
  await writeFile(resolve(activeRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return { root, activeRoot, manifest };
}

test("catalog snapshots are immutable and verify the active asset bytes", async () => {
  const fixture = await projectFixture();
  try {
    const first = await snapshotCatalog(fixture.root, "production");
    const second = await snapshotCatalog(fixture.root, "production");
    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal((await verifyCatalogHistory(fixture.root)).version, fixture.manifest.catalogVersion);
    await writeFile(first.snapshotPath, "{}\n");
    await assert.rejects(snapshotCatalog(fixture.root, "production"), /内容不同/);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("immutable catalog files may be reused but never overwritten", async () => {
  const fixture = await projectFixture();
  try {
    const source = resolve(fixture.root, "source.bin");
    const destination = resolve(fixture.root, "destination.bin");
    await writeFile(source, "same");
    assert.equal((await copyImmutableFile(source, destination)).copied, true);
    assert.equal((await copyImmutableFile(source, destination)).copied, false);
    await writeFile(source, "different");
    await assert.rejects(copyImmutableFile(source, destination), /内容不同/);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("a candidate manifest snapshot is written before activation and must match exactly", async () => {
  const fixture = await projectFixture();
  try {
    const next = { ...fixture.manifest, catalogVersion: "2026.10.31.1", publishedAt: "2026-10-31T00:00:00.000Z" };
    const snapshot = await snapshotCatalogManifest(fixture.root, "production", next);
    assert.equal(snapshot.created, true);
    await writeFile(resolve(fixture.activeRoot, "manifest.json"), `${JSON.stringify(next, null, 2)}\n`);
    assert.equal((await verifyCatalogHistory(fixture.root)).version, next.catalogVersion);
    await assert.rejects(snapshotCatalogManifest(fixture.root, "production", { ...next, publishedAt: "2026-10-31T01:00:00.000Z" }), /内容不同/);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("rollback defaults to dry-run and apply creates a new monotonic manifest", async () => {
  const fixture = await projectFixture();
  try {
    await snapshotCatalog(fixture.root, "production");
    const current = { ...fixture.manifest, catalogVersion: "2026.10.31.1", publishedAt: "2026-10-31T00:00:00.000Z", items: [] };
    await writeFile(resolve(fixture.activeRoot, "manifest.json"), `${JSON.stringify(current, null, 2)}\n`);
    const dryRun = await rollbackCatalog(fixture.root, {
      toVersion: "2026.10.30.1",
      nextVersion: "2026.10.31.2",
      performedAt: "2026-10-31T01:00:00.000Z"
    });
    assert.equal(dryRun.applied, false);
    assert.equal(JSON.parse(await readFile(resolve(fixture.activeRoot, "manifest.json"), "utf8")).catalogVersion, "2026.10.31.1");

    const applied = await rollbackCatalog(fixture.root, {
      toVersion: "2026.10.30.1",
      nextVersion: "2026.10.31.2",
      performedAt: "2026-10-31T01:00:00.000Z",
      apply: true
    });
    assert.equal(applied.applied, true);
    const restored = JSON.parse(await readFile(resolve(fixture.activeRoot, "manifest.json"), "utf8"));
    assert.equal(restored.catalogVersion, "2026.10.31.2");
    assert.equal(restored.items.length, 1);
    assert.deepEqual(restored.rollback, {
      fromVersion: "2026.10.31.1",
      restoredVersion: "2026.10.30.1",
      performedAt: "2026-10-31T01:00:00.000Z"
    });
    assert.equal((await verifyCatalogHistory(fixture.root)).version, "2026.10.31.2");
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});
