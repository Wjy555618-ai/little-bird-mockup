import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { inspectReleaseBundle } from "../scripts/lib/release-artifact.mjs";

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function run(cwd, program, args, options = {}) {
  return spawnSync(program, args, { cwd, encoding: "utf8", env: options.env || process.env });
}

function mustRun(cwd, program, args) {
  const result = run(cwd, program, args);
  assert.equal(result.status, 0, `${program} ${args.join(" ")} failed:\n${result.stderr || result.stdout}`);
  return result;
}

test("release pipeline requires a published tag, packages one provenance-bound REL bundle and refuses overwrite", { timeout: 30000 }, async () => {
  const root = await mkdtemp(resolve(tmpdir(), "mockup-release-pipeline-"));
  const remoteRoot = await mkdtemp(resolve(tmpdir(), "mockup-release-remote-"));
  try {
    for (const directory of ["catalog", "config", "plugin", "quality", "scripts", "shared"]) {
      await cp(resolve(sourceRoot, directory), resolve(root, directory), { recursive: true });
    }
    for (const file of [".gitignore", "package.json", "pnpm-lock.yaml"]) {
      await cp(resolve(sourceRoot, file), resolve(root, file));
    }
    await symlink(resolve(sourceRoot, "node_modules"), resolve(root, "node_modules"), "dir");

    const configPath = resolve(root, "config/plugin.config.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    const releaseVersion = config.pluginVersion;
    const releaseTag = `v${releaseVersion}`;
    config.environments.production = {
      pluginId: "1234567890123456789",
      catalogUrl: "https://assets.mockup-studio-cdn.com/v1/manifest.json",
      catalogEnvironment: "production"
    };
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
    const fetchMockPath = resolve(root, "release-fetch-mock.mjs");
    await writeFile(fetchMockPath, [
      'import { readFile } from "node:fs/promises";',
      'const catalog = await readFile(new URL("./catalog/production/v1/manifest.json", import.meta.url));',
      'globalThis.fetch = async () => new Response(catalog, { status: 200, headers: { "content-type": "application/json", "content-length": String(catalog.length) } });',
      ""
    ].join("\n"));

    mustRun(root, "git", ["init", "-q"]);
    mustRun(root, "git", ["config", "user.name", "Release Test"]);
    mustRun(root, "git", ["config", "user.email", "release-test@example.invalid"]);
    mustRun(root, "git", ["add", "-A"]);
    mustRun(root, "git", ["commit", "-qm", "test release"]);
    mustRun(root, "git", ["tag", releaseTag]);
    mustRun(root, "git", ["remote", "add", "origin", "https://git.mockup-studio-cdn.com/mockup-studio.git"]);
    mustRun(remoteRoot, "git", ["init", "--bare", "-q"]);
    mustRun(root, "git", ["config", `url.${pathToFileURL(remoteRoot).href}.insteadOf`, "https://git.mockup-studio-cdn.com/mockup-studio.git"]);
    mustRun(root, "git", ["config", "protocol.file.allow", "always"]);
    const sourceRevision = mustRun(root, "git", ["rev-parse", "HEAD"]).stdout.trim();
    const releaseEnvironment = {
      ...process.env,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS || ""} --import=${pathToFileURL(fetchMockPath).href}`.trim()
    };

    const unpublished = run(root, process.execPath, ["scripts/verify-release.mjs", "--out-dir", "dist/plugin"], { env: releaseEnvironment });
    assert.equal(unpublished.status, 1);
    assert.match(unpublished.stderr, /必须已发布到 origin/);

    mustRun(root, "git", ["push", "-q", "origin", "HEAD:refs/heads/main", `refs/tags/${releaseTag}`]);

    const first = run(root, process.execPath, ["scripts/verify-release.mjs", "--out-dir", "dist/plugin"], { env: releaseEnvironment });
    assert.equal(first.status, 0, first.stderr || first.stdout);
    assert.match(first.stdout, new RegExp(`Release engineering gate PASS: ${releaseTag.replaceAll(".", "\\.")}, REL-[A-F0-9]{12}`));
    assert.match(first.stdout, /Immutable release bundle written/);

    const policySource = await readFile(resolve(root, "quality/measurement-policy.json"));
    const contractSource = await readFile(resolve(root, "quality/acceptance-gates.json"));
    const bundle = await inspectReleaseBundle(resolve(root, "dist/plugin"), {
      version: releaseVersion,
      sourceRevision,
      measurementPolicySha256: createHash("sha256").update(policySource).digest("hex"),
      contractId: "MOCKUP-STUDIO-PRODUCTION-CONTRACT-1",
      contractSha256: createHash("sha256").update(contractSource).digest("hex")
    });
    assert.equal(bundle.provenance.sourceTag, releaseTag);
    assert.equal(bundle.provenance.sourceRevision, sourceRevision);

    const second = run(root, process.execPath, ["scripts/verify-release.mjs", "--out-dir", "dist/plugin"], { env: releaseEnvironment });
    assert.equal(second.status, 1);
    assert.match(second.stderr, /禁止覆盖既有发布制品/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(remoteRoot, { recursive: true, force: true });
  }
});
