import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  authorizeCandidateRequest,
  createCandidate,
  inspectWorkflow,
  migrateWorkflowV4,
  parseJsonOption,
  parseRecommendedSize,
  prepareFinalReview,
  quarantineCandidate,
  recordFinalBatchApproval
} from "./lib/asset-pipeline.mjs";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2);
const command = args[0] || "status";

function value(name, required = false) {
  const index = args.indexOf(name);
  const result = index >= 0 ? args[index + 1] : "";
  if (required && !result) throw new Error(`缺少 ${name}`);
  return result;
}

function assetIds() {
  return value("--ids").split(",").map((item) => item.trim()).filter(Boolean);
}

if (command === "authorize-request") {
  const result = await authorizeCandidateRequest(projectRoot, {
    referencePath: value("--reference", true),
    name: value("--name", true),
    category: value("--category", true),
    rightsMode: value("--rights", true),
    assetId: value("--id", true),
    requestText: value("--request-text", true),
    actor: value("--actor", true),
    role: value("--role"),
    referenceReuseAuthorized: args.includes("--allow-reference-reuse"),
    confirmedByHuman: args.includes("--confirmed-by-human"),
    recordedBy: value("--recorded-by") || "AI/工程执行代理"
  });
  console.log(JSON.stringify({ ok: true, requestId: result.request.requestId, requestSha256: result.requestSha256, status: result.status, nextAction: result.nextAction }, null, 2));
} else if (command === "import") {
  const result = await createCandidate(projectRoot, {
    requestId: value("--request-id", true),
    basePath: value("--base", true),
    tags: value("--tags").split(",").map((item) => item.trim()).filter(Boolean),
    screenQuad: parseJsonOption(value("--screen-quad", true), "--screen-quad"),
    apertureQuad: value("--aperture-quad") ? parseJsonOption(value("--aperture-quad"), "--aperture-quad") : null,
    cornerRadii: value("--corner-radii") ? parseJsonOption(value("--corner-radii"), "--corner-radii") : [0, 0, 0, 0],
    recommendedSize: parseRecommendedSize(value("--recommended", true)),
    defaultFit: value("--fit") || "cover",
    screenPresentationMode: value("--screen-presentation") || "neutral-off",
    generationNote: value("--generation-note"),
    actor: value("--actor") || "AI/工程执行代理"
  });
  console.log(JSON.stringify({ ok: true, assetId: result.item.id, revision: result.item.revision, candidateSha256: result.item.integrity.baseSha256, itemSha256: result.itemSha256, state: result.workflow.state, nextAction: result.workflow.nextAction }, null, 2));
} else if (command === "quarantine") {
  const result = await quarantineCandidate(projectRoot, {
    assetId: value("--id", true),
    reason: value("--reason", true),
    actor: value("--actor", true)
  });
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
} else if (command === "migrate-v4") {
  console.log(JSON.stringify({ ok: true, ...(await migrateWorkflowV4(projectRoot)) }, null, 2));
} else if (command === "prepare-final-review") {
  const result = await prepareFinalReview(projectRoot, { assetIds: assetIds() });
  console.log(JSON.stringify({
    ok: true,
    batchFingerprint: result.packet.batchFingerprint,
    buildFingerprint: result.packet.buildFingerprint,
    hostEvidencePath: result.packet.hostEvidencePath,
    hostEvidenceSha256: result.packet.hostEvidenceSha256,
    reviewPacketPath: result.relativePath,
    items: result.packet.items
  }, null, 2));
} else if (command === "approve-final" || command === "reject-final") {
  const result = await recordFinalBatchApproval(projectRoot, {
    assetIds: assetIds(),
    actor: value("--actor", true),
    role: value("--role"),
    expectedBatchFingerprint: value("--expected-batch-fingerprint", true),
    decision: command === "reject-final" ? "reject" : "approve-and-promote-local",
    confirmedByHuman: args.includes("--confirmed-by-human")
  });
  console.log(JSON.stringify({ ok: true, batchFingerprint: result.batch.batchFingerprint, state: result.workflowState, items: result.approvals }, null, 2));
} else if (command === "status" || command === "check") {
  const report = await inspectWorkflow(projectRoot);
  console.log(JSON.stringify(report, null, 2));
  if (report.assets.some((item) => item.state === "BLOCKED")) process.exitCode = 1;
} else {
  throw new Error("用法：asset-pipeline.mjs authorize-request|import|quarantine|migrate-v4|prepare-final-review|approve-final|reject-final|status|check [参数]");
}
