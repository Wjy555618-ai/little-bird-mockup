import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const policyPath = resolve(projectRoot, "quality/asset-pipeline-policy.json");

function fail(message) { throw new Error(message); }
function digest(bytes) { return createHash("sha256").update(bytes).digest("hex"); }

const policy = await readFile(policyPath, "utf8").then(JSON.parse);

if (policy.schemaVersion !== 2 || policy.policyRevision !== 5 || policy.status !== "active" || policy.policyId !== "MOCKUP-ASSET-PIPELINE-1") fail("样机流水线政策身份无效");
for (const field of ["externalDeploymentAllowed", "githubPublicationAllowed", "netlifyDeploymentAllowed", "figmaCommunityPublicationAllowed"]) {
  if (policy.scope?.[field] !== false) fail(`资产流水线合同不得授权 ${field}`);
}
if (policy.scope?.environment !== "local-asset-control-plane" || policy.scope?.externalDeploymentGovernedBySeparateContract !== true || policy.scope?.externalDeploymentAuthority !== "quality/remote-catalog-contract.json") fail("外部发布责任边界无效");
if (!Array.isArray(policy.gates) || policy.gates.length !== 11 || policy.gates.some((gate) => gate.failClosed !== true) || !policy.gates.some((gate) => gate.id === "AP-G00") || !policy.gates.some((gate) => gate.id === "AP-G10")) fail("十一项资产流水线门禁必须全部失败关闭");
if (policy.candidateAuthorization?.required !== true || policy.candidateAuthorization?.singleUse !== true || policy.candidateAuthorization?.maximumCandidatesPerRequest !== 1 || policy.candidateAuthorization?.rightsDeclarationIsCreationAuthorization !== false || policy.candidateAuthorization?.referenceReuseRequiresExplicitAuthorization !== true) fail("候选创作委托政策不完整");
if (!Array.isArray(policy.taxonomy?.categories) || new Set(policy.taxonomy.categories.map((item) => item.id)).size !== policy.taxonomy.categories.length || policy.taxonomy.allowUnknown !== false || policy.taxonomy.allowAutomaticCreation !== false) fail("受控分类政策无效");
if (!Array.isArray(policy.workflow?.states) || policy.workflow.initialState !== "REQUEST_AUTHORIZED" || !policy.workflow.states.includes("REQUEST_AUTHORIZED") || !policy.workflow.states.includes("FINAL_APPROVED") || !policy.workflow.states.includes("PROMOTED") || !policy.workflow.states.includes("BLOCKED") || policy.workflow.states.includes("VISUAL_APPROVED") || policy.workflow.states.includes("RELEASE_APPROVED")) fail("流水线状态机不完整或仍含旧审批层");
if (!Array.isArray(policy.identity?.approvalBindingFields) || ["assetId", "revision", "itemSha256"].some((field) => !policy.identity.approvalBindingFields.includes(field))) fail("批准绑定字段不完整");
if (policy.approvals?.technicalQa?.actorType !== "system" || policy.approvals?.technicalQa?.requiredAfterState !== "CANDIDATE_READY") fail("技术 QA 不得存在人工前置批准");
if (policy.approvals?.finalBatch?.actorType !== "human" || policy.approvals.finalBatch.requiredAfterState !== "QA_PASSED" || policy.approvals.finalBatch.maximumHumanDecisions !== 1 || policy.approvals?.visual) fail("必须只保留一次最终批次决定");
for (const field of ["batchFingerprint", "buildFingerprint", "hostEvidenceSha256", "items.assetId", "items.revision", "items.itemSha256", "items.qaReportSha256", "decision", "decidedAt", "actor"]) {
  if (!policy.approvals.finalBatch.bindingFields?.includes(field)) fail(`最终批次决定缺少绑定字段：${field}`);
}

if (!Array.isArray(policy.contractSources) || policy.contractSources.length !== 3) fail("当前合同来源清单不完整");
for (const source of policy.contractSources) {
  if (!/^[a-f0-9]{64}$/.test(source.sha256 || "") || !source.path) fail("合同来源摘要配置无效");
  const path = resolve(projectRoot, source.path);
  const info = await stat(path).catch(() => null);
  if (!info?.isFile()) fail(`合同来源不存在：${source.path}`);
  const actual = digest(await readFile(path));
  if (actual !== source.sha256) fail(`合同来源摘要漂移：${source.path}`);
}

console.log(`asset pipeline contract OK: ${policy.policyId}, ${policy.gates.length} gates, ${policy.taxonomy.categories.length} categories`);
