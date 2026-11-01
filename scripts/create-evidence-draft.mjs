import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createEvidenceDraft, resolveContractEvidencePath } from "./lib/evidence-contract.mjs";
import { inspectReleaseBundle } from "./lib/release-artifact.mjs";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2);

function argument(name, fallback = "") {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

function fail(message) {
  throw new Error(message);
}

const gateId = argument("--gate");
const artifactRoot = resolve(argument("--artifact-dir"));
const evidenceId = argument("--id");
const evidenceScope = argument("--scope");
if (!gateId || !argument("--artifact-dir") || !evidenceId) fail("用法：node scripts/create-evidence-draft.mjs --gate <G-xxx> --artifact-dir <正式插件目录> --id <证据ID> [--scope <cohort或period>] [--write]");

const [contractSource, config, policySource] = await Promise.all([
  readFile(resolve(projectRoot, "quality/acceptance-gates.json")),
  readFile(resolve(projectRoot, "config/plugin.config.json"), "utf8").then(JSON.parse),
  readFile(resolve(projectRoot, "quality/measurement-policy.json"))
]);
const contract = JSON.parse(contractSource.toString("utf8"));
const policy = JSON.parse(policySource.toString("utf8"));
const measurementPolicySha256 = createHash("sha256").update(policySource).digest("hex");
const contractSha256 = createHash("sha256").update(contractSource).digest("hex");
const gate = contract.gates.find((item) => item.id === gateId && item.evidenceType === "manual-artifact");
if (!gate) fail(`不存在人工门禁：${gateId}`);

const sourceTag = `v${config.pluginVersion}`;
const revision = spawnSync("git", ["rev-parse", "--verify", `${sourceTag}^{commit}`], { cwd: projectRoot, encoding: "utf8" });
if (revision.status !== 0 || !/^[a-f0-9]{40}$/.test(revision.stdout.trim())) fail(`无法从 ${sourceTag} 解析发布源提交`);
const bundle = await inspectReleaseBundle(artifactRoot, {
  version: config.pluginVersion,
  sourceRevision: revision.stdout.trim(),
  measurementPolicySha256,
  contractId: contract.contractId,
  contractSha256
});
const document = createEvidenceDraft({
  gate,
  gatePolicy: policy.gates[gate.id],
  evidenceId,
  evidenceScope,
  measurementPolicySha256,
  release: {
    version: config.pluginVersion,
    fingerprint: bundle.fingerprint,
    sourceRevision: revision.stdout.trim(),
    artifactSha256: bundle.sha256,
    contractSha256,
    catalogVersion: bundle.provenance.catalogVersion,
    catalogManifestSha256: bundle.catalogManifestSha256
  }
});
const outputPath = resolveContractEvidencePath(projectRoot, gate, document);
const serialized = `${JSON.stringify(document, null, 2)}\n`;
if (args.includes("--write")) {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serialized, { flag: "wx" });
  console.log(`Fail-closed evidence draft written to ${relative(projectRoot, outputPath)}`);
} else {
  console.log(`# Expected path: ${relative(projectRoot, outputPath)}`);
  process.stdout.write(serialized);
}
