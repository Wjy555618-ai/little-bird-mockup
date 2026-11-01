import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { validateDevelopmentContract } from "../scripts/lib/contract-policy.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const contract = JSON.parse(await readFile(resolve(root, "quality/acceptance-gates.json"), "utf8"));
const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const policy = JSON.parse(await readFile(resolve(root, "quality/measurement-policy.json"), "utf8"));
const fixedNow = new Date("2026-11-01T00:00:00.000Z");

function copy(value) {
  return structuredClone(value);
}

test("production contract has the exact mandatory gates, claim inheritance and policy schema", () => {
  assert.equal(validateDevelopmentContract(contract, packageJson, policy, { now: fixedNow }), true);
});

test("contract validation rejects removed gates, weakened claims and command substitution", () => {
  const removed = copy(contract);
  removed.gates = removed.gates.filter((gate) => gate.id !== "G-080");
  removed.claimLevels = Object.fromEntries(Object.entries(removed.claimLevels).map(([claim, gateIds]) => [claim, gateIds.filter((id) => id !== "G-080")]));
  assert.throws(() => validateDevelopmentContract(removed, packageJson, policy, { now: fixedNow }), /门禁集合|17个固定阻断门禁/);

  const weakened = copy(contract);
  weakened.claimLevels.PUBLISH_READY = weakened.claimLevels.PUBLISH_READY.filter((id) => id !== "G-140");
  assert.throws(() => validateDevelopmentContract(weakened, packageJson, policy, { now: fixedNow }), /PUBLISH_READY/);

  const substituted = copy(contract);
  substituted.gates.find((gate) => gate.id === "G-020").command = "pnpm check";
  assert.throws(() => validateDevelopmentContract(substituted, packageJson, policy, { now: fixedNow }), /自动命令漂移/);
});

test("contract validation rejects policy drift, unsafe paths and unbounded ratios", () => {
  const missingReleaseBinding = copy(policy);
  missingReleaseBinding.evidenceSchema.requiredReleaseFields.splice(4, 1);
  assert.throws(() => validateDevelopmentContract(contract, packageJson, missingReleaseBinding, { now: fixedNow }), /发布绑定字段/);

  const unsafe = copy(contract);
  unsafe.gates.find((gate) => gate.id === "G-120").requiredEvidence.pathPattern = "../performance.json";
  assert.throws(() => validateDevelopmentContract(unsafe, packageJson, policy, { now: fixedNow }), /安全JSON相对路径/);

  const unbounded = copy(policy);
  unbounded.gates["G-210"].scenarios.activation.assertions = unbounded.gates["G-210"].scenarios.activation.assertions.filter((item) => item.operator === "ratio" || item.field !== "rate");
  assert.throws(() => validateDevelopmentContract(contract, packageJson, unbounded, { now: fixedNow }), /缺少预注册边界/);
});
