import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveContractEvidencePath } from "./lib/evidence-contract.mjs";
import { inspectReleaseBundle } from "./lib/release-artifact.mjs";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const contractSource = await readFile(resolve(projectRoot, "quality/acceptance-gates.json"));
const contract = JSON.parse(contractSource.toString("utf8"));
const policySource = await readFile(resolve(projectRoot, "quality/measurement-policy.json"));
const policy = JSON.parse(policySource.toString("utf8"));
const config = JSON.parse(await readFile(resolve(projectRoot, "config/plugin.config.json"), "utf8"));

export const measurementPolicySha256 = createHash("sha256").update(policySource).digest("hex");
export const contractSha256 = createHash("sha256").update(contractSource).digest("hex");

function fail(message) {
  throw new Error(message);
}

function fieldValue(object, path) {
  return path.split(".").reduce((value, key) => value?.[key], object);
}

function assertionPass(measurements, assertion) {
  const actual = fieldValue(measurements, assertion.field);
  if (assertion.operator === "eq") return actual === assertion.value;
  if (assertion.operator === "gte") return typeof actual === "number" && Number.isFinite(actual) && actual >= assertion.value;
  if (assertion.operator === "lte") return typeof actual === "number" && Number.isFinite(actual) && actual <= assertion.value;
  if (assertion.operator === "integerGte") return Number.isSafeInteger(actual) && actual >= assertion.value;
  if (assertion.operator === "ratio") {
    const numerator = fieldValue(measurements, assertion.numeratorField);
    const denominator = fieldValue(measurements, assertion.denominatorField);
    return Number.isSafeInteger(numerator) && numerator >= 0 && Number.isSafeInteger(denominator) && denominator > 0 && typeof actual === "number" && Number.isFinite(actual) && Math.abs(actual - numerator / denominator) <= 1e-12;
  }
  fail(`未知测量运算符：${assertion.operator}`);
}

function validDate(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function nonEmptyObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0;
}

async function fileSha256(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

export async function validateEvidenceDocument(document, options) {
  const gate = contract.gates.find((item) => item.id === options.gateId);
  if (!gate || gate.evidenceType !== "manual-artifact") fail(`不存在人工门禁：${options.gateId}`);
  const gatePolicy = policy.gates?.[gate.id];
  if (!gatePolicy) fail(`${gate.id} 缺少测量政策`);
  if (document.schemaVersion !== 1 || document.gateId !== gate.id || !/^[A-Z0-9][A-Z0-9._-]{2,79}$/.test(document.evidenceId || "")) fail(`${gate.id} 证据身份无效`);
  if (document.measurementPolicySha256 !== measurementPolicySha256) fail(`${gate.id} 测量政策摘要绑定错误`);
  if (document.ownerRole !== gate.ownerRole) fail(`${gate.id} 责任角色与合同不一致`);
  if (!validDate(document.createdAt)) fail(`${gate.id} 创建时间无效`);
  const createdAt = Date.parse(document.createdAt);
  const now = options.now instanceof Date ? options.now.getTime() : (typeof options.now === "number" ? options.now : Date.now());
  if (createdAt > now + 5 * 60 * 1000) fail(`${gate.id} 创建时间位于未来`);

  const release = document.release || {};
  for (const field of policy.evidenceSchema.requiredReleaseFields) {
    if (!Object.hasOwn(release, field)) fail(`${gate.id} 发布绑定缺少字段：${field}`);
  }
  if (release.version !== options.version || release.version !== config.pluginVersion) fail(`${gate.id} 插件版本绑定错误`);
  if (!/^REL-[A-F0-9]{12}$/.test(release.fingerprint || "") || release.fingerprint !== options.fingerprint) fail(`${gate.id} 发布指纹绑定错误`);
  if (!/^[a-f0-9]{40}$/.test(release.sourceRevision || "") || release.sourceRevision !== options.sourceRevision) fail(`${gate.id} 源提交绑定错误`);
  if (!/^[a-f0-9]{64}$/.test(release.artifactSha256 || "") || release.artifactSha256 !== options.artifactSha256) fail(`${gate.id} 制品摘要绑定错误`);
  if (!/^[a-f0-9]{64}$/.test(release.contractSha256 || "") || release.contractSha256 !== options.contractSha256 || release.contractSha256 !== contractSha256) fail(`${gate.id} 合同摘要绑定错误`);
  if (release.catalogVersion !== options.catalogVersion) fail(`${gate.id} 目录版本绑定错误`);
  if (!/^[a-f0-9]{64}$/.test(release.catalogManifestSha256 || "") || release.catalogManifestSha256 !== options.catalogManifestSha256) fail(`${gate.id} 目录摘要绑定错误`);

  if (options.enforcePath !== false) {
    if (!options.filePath || resolve(options.filePath) !== resolveContractEvidencePath(projectRoot, gate, document)) fail(`${gate.id} 证据文件路径不符合合同`);
    const [projectRealPath, evidenceRealPath] = await Promise.all([realpath(projectRoot), realpath(options.filePath)]);
    if (!evidenceRealPath.startsWith(`${projectRealPath}${sep}`)) fail(`${gate.id} 证据文件真实路径必须位于项目内`);
  }

  if (!Array.isArray(document.scenarios)) fail(`${gate.id} 缺少场景结果`);
  const requiredScenarioIds = new Set(gate.requiredEvidence.requiredScenarios);
  const byId = new Map();
  for (const scenario of document.scenarios) {
    if (!scenario?.id || byId.has(scenario.id)) fail(`${gate.id} 场景ID缺失或重复`);
    if (!requiredScenarioIds.has(scenario.id)) fail(`${gate.id} 包含合同未定义的场景：${scenario.id}`);
    byId.set(scenario.id, scenario);
  }

  for (const requiredId of gate.requiredEvidence.requiredScenarios) {
    const scenario = byId.get(requiredId);
    if (!scenario) fail(`${gate.id} 缺少场景：${requiredId}`);
    if (scenario.status !== "PASS") fail(`${gate.id}/${requiredId} 未通过或被跳过`);
    for (const field of policy.evidenceSchema.requiredScenarioFields) {
      if (!Object.hasOwn(scenario, field)) fail(`${gate.id}/${requiredId} 缺少字段：${field}`);
    }
    if (!validDate(scenario.startedAt) || !validDate(scenario.finishedAt) || Date.parse(scenario.finishedAt) < Date.parse(scenario.startedAt)) fail(`${gate.id}/${requiredId} 测量时间无效`);
    if (Date.parse(scenario.startedAt) < Date.parse(policy.registeredAt)) fail(`${gate.id}/${requiredId} 测量早于政策登记时间`);
    if (Date.parse(scenario.finishedAt) > createdAt) fail(`${gate.id}/${requiredId} 测量结束时间晚于证据创建时间`);
    if (![scenario.environment, scenario.input, scenario.result, scenario.measurements].every(nonEmptyObject)) fail(`${gate.id}/${requiredId} 环境、输入、结果和测量必须是非空对象`);
    if (!Array.isArray(scenario.evidenceRefs) || !scenario.evidenceRefs.length) fail(`${gate.id}/${requiredId} 缺少原始附件`);

    const attachmentPaths = new Set();
    for (const reference of scenario.evidenceRefs) {
      if (!nonEmptyObject(reference)) fail(`${gate.id}/${requiredId} 附件引用必须包含路径、字节数和SHA-256`);
      for (const field of policy.evidenceSchema.requiredAttachmentRefFields) {
        if (!Object.hasOwn(reference, field)) fail(`${gate.id}/${requiredId} 附件引用缺少字段：${field}`);
      }
      if (typeof reference.path !== "string" || !reference.path || isAbsolute(reference.path) || reference.path.split(/[\\/]/).includes("..")) fail(`${gate.id}/${requiredId} 附件路径必须位于证据目录内`);
      if (attachmentPaths.has(reference.path)) fail(`${gate.id}/${requiredId} 附件路径重复：${reference.path}`);
      attachmentPaths.add(reference.path);
      if (!Number.isSafeInteger(reference.bytes) || reference.bytes < 1) fail(`${gate.id}/${requiredId} 附件字节数无效：${reference.path}`);
      if (!/^[a-f0-9]{64}$/.test(reference.sha256 || "")) fail(`${gate.id}/${requiredId} 附件摘要无效：${reference.path}`);
      if (options.checkFiles !== false) {
        const attachment = resolve(dirname(options.filePath), reference.path);
        const metadata = await stat(attachment).catch(() => null);
        if (!metadata?.isFile() || metadata.size < 1) fail(`${gate.id}/${requiredId} 附件不存在或为空：${reference.path}`);
        if (metadata.size !== reference.bytes) fail(`${gate.id}/${requiredId} 附件字节数绑定错误：${reference.path}`);
        const [evidenceRoot, attachmentPath] = await Promise.all([
          realpath(dirname(options.filePath)),
          realpath(attachment)
        ]);
        if (attachmentPath !== evidenceRoot && !attachmentPath.startsWith(`${evidenceRoot}${sep}`)) fail(`${gate.id}/${requiredId} 附件真实路径必须位于证据目录内`);
        if (await fileSha256(attachmentPath) !== reference.sha256) fail(`${gate.id}/${requiredId} 附件SHA-256绑定错误：${reference.path}`);
      }
    }

    for (const assertion of gatePolicy.scenarios?.[requiredId]?.assertions || []) {
      const actual = fieldValue(scenario.measurements, assertion.field);
      if (!assertionPass(scenario.measurements, assertion)) {
        const expectation = assertion.operator === "ratio"
          ? `${assertion.numeratorField}/${assertion.denominatorField}`
          : JSON.stringify(assertion.value);
        fail(`${gate.id}/${requiredId} 未满足 ${assertion.field} ${assertion.operator} ${expectation}，实际为 ${JSON.stringify(actual)}`);
      }
    }
  }
  return true;
}

function argument(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const filePath = resolve(argument("--file"));
  const gateId = argument("--gate");
  const version = argument("--version", config.pluginVersion);
  const artifactRoot = resolve(argument("--artifact-dir"));
  if (!argument("--file") || !gateId || !argument("--artifact-dir")) fail("用法：node scripts/verify-evidence.mjs --file <json> --gate <G-xxx> --artifact-dir <正式插件目录> [--version <x.y.z>]");
  const tagName = `v${version}`;
  const revisionResult = spawnSync("git", ["rev-parse", "--verify", `${tagName}^{commit}`], { cwd: projectRoot, encoding: "utf8" });
  if (revisionResult.status !== 0 || !/^[a-f0-9]{40}$/.test(revisionResult.stdout.trim())) fail(`无法从 ${tagName} 解析发布源提交`);
  const artifact = await inspectReleaseBundle(artifactRoot, {
    version,
    sourceRevision: revisionResult.stdout.trim(),
    measurementPolicySha256,
    contractId: contract.contractId,
    contractSha256
  });
  const document = JSON.parse(await readFile(filePath, "utf8"));
  await validateEvidenceDocument(document, {
    gateId,
    version,
    fingerprint: artifact.fingerprint,
    sourceRevision: revisionResult.stdout.trim(),
    artifactSha256: artifact.sha256,
    contractSha256,
    catalogVersion: artifact.provenance.catalogVersion,
    catalogManifestSha256: artifact.catalogManifestSha256,
    filePath
  });
  console.log(`${gateId} evidence PASS: ${filePath}`);
}
