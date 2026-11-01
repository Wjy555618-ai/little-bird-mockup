import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function fixture() {
  const root = await mkdtemp(resolve(tmpdir(), "mockup-asset-contract-"));
  for (const path of ["scripts/verify-asset-pipeline-contract.mjs", "quality/asset-pipeline-policy.json"]) {
    await mkdir(dirname(resolve(root, path)), { recursive: true });
    await cp(resolve(sourceRoot, path), resolve(root, path), { recursive: true });
  }
  for (const name of [
    "ASSET_PIPELINE_AUTHORITY_2026-10-31.md",
    "ASSET_PIPELINE_DEVELOPMENT_CONTRACT.md",
    "ASSET_PIPELINE_WORKFLOW_SIMPLIFICATION_2026-10-31.md"
  ]) {
    await mkdir(resolve(root, "docs"), { recursive: true });
    await cp(resolve(sourceRoot, "docs", name), resolve(root, "docs", name));
  }
  return root;
}

function run(root) {
  return spawnSync(process.execPath, ["scripts/verify-asset-pipeline-contract.mjs"], { cwd: root, encoding: "utf8" });
}

test("asset pipeline contract accepts the fail-closed local control plane and delegates deployment authority", async () => {
  const root = await fixture();
  try {
    const result = run(root);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /11 gates, 3 categories/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("asset pipeline contract rejects direct deployment permission and source drift", async () => {
  const root = await fixture();
  try {
    const policyPath = resolve(root, "quality/asset-pipeline-policy.json");
    const policy = JSON.parse(await readFile(policyPath, "utf8"));
    policy.scope.githubPublicationAllowed = true;
    await writeFile(policyPath, `${JSON.stringify(policy, null, 2)}\n`);
    let result = run(root);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /不得授权 githubPublicationAllowed/);

    await cp(resolve(sourceRoot, "quality/asset-pipeline-policy.json"), policyPath);
    const sourcePath = resolve(root, "docs/ASSET_PIPELINE_AUTHORITY_2026-10-31.md");
    await writeFile(sourcePath, `${await readFile(sourcePath, "utf8")}\n漂移`);
    result = run(root);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /合同来源摘要漂移/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
