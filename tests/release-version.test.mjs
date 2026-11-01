import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("release version command updates both version authorities and rejects drift", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "mockup-release-version-"));
  try {
    await cp(resolve(sourceRoot, "package.json"), resolve(root, "package.json"));
    await cp(resolve(sourceRoot, "config"), resolve(root, "config"), { recursive: true });
    await mkdir(resolve(root, "scripts"));
    await cp(resolve(sourceRoot, "scripts/set-release-version.mjs"), resolve(root, "scripts/set-release-version.mjs"));

    const first = spawnSync(process.execPath, ["scripts/set-release-version.mjs", "0.1.3"], { cwd: root, encoding: "utf8" });
    assert.equal(first.status, 0, first.stderr || first.stdout);
    const [packageJson, config] = await Promise.all([
      readFile(resolve(root, "package.json"), "utf8").then(JSON.parse),
      readFile(resolve(root, "config/plugin.config.json"), "utf8").then(JSON.parse)
    ]);
    assert.equal(packageJson.version, "0.1.3");
    assert.equal(config.pluginVersion, "0.1.3");

    const downgrade = spawnSync(process.execPath, ["scripts/set-release-version.mjs", "0.1.2"], { cwd: root, encoding: "utf8" });
    assert.equal(downgrade.status, 1);
    assert.match(downgrade.stderr, /必须高于当前版本/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
