const REQUIRED_RELEASE_FIELDS = Object.freeze([
  "version",
  "fingerprint",
  "sourceRevision",
  "artifactSha256",
  "contractSha256",
  "catalogVersion",
  "catalogManifestSha256"
]);

const REQUIRED_SCENARIO_FIELDS = Object.freeze([
  "id",
  "status",
  "startedAt",
  "finishedAt",
  "environment",
  "input",
  "result",
  "measurements",
  "evidenceRefs"
]);

const GATE_REQUIREMENTS = Object.freeze({
  "G-001": { stage: "development", evidenceType: "automated", command: "pnpm contract:check" },
  "G-010": { stage: "development", evidenceType: "automated", command: "pnpm check" },
  "G-020": { stage: "release", evidenceType: "automated", command: "pnpm release:check" },
  "G-030": { stage: "development", evidenceType: "automated", command: "pnpm accessibility:check" },
  "G-040": { stage: "development", evidenceType: "automated", command: "pnpm security:check" },
  "G-050": { stage: "development", evidenceType: "automated", command: "pnpm scale:check" },
  "G-060": { stage: "development", evidenceType: "automated", command: "pnpm catalog:history:check" },
  "G-070": { stage: "development", evidenceType: "automated", command: "pnpm performance:smoke" },
  "G-080": { stage: "development", evidenceType: "automated", command: "pnpm ci:check" },
  "G-100": { stage: "release", evidenceType: "manual-artifact" },
  "G-110": { stage: "release", evidenceType: "manual-artifact" },
  "G-120": { stage: "release", evidenceType: "manual-artifact" },
  "G-130": { stage: "release", evidenceType: "manual-artifact" },
  "G-140": { stage: "release", evidenceType: "manual-artifact" },
  "G-150": { stage: "operations", evidenceType: "manual-artifact" },
  "G-200": { stage: "market", evidenceType: "manual-artifact" },
  "G-210": { stage: "market", evidenceType: "manual-artifact" }
});

const CLAIM_REQUIREMENTS = Object.freeze({
  DEVELOPMENT_READY: ["G-001", "G-010", "G-030", "G-040", "G-050", "G-060", "G-070", "G-080"],
  PUBLISH_READY: ["G-001", "G-010", "G-020", "G-030", "G-040", "G-050", "G-060", "G-070", "G-080", "G-100", "G-110", "G-120", "G-130", "G-140"],
  MATURE_PRODUCT: ["G-001", "G-010", "G-020", "G-030", "G-040", "G-050", "G-060", "G-070", "G-080", "G-100", "G-110", "G-120", "G-130", "G-140", "G-150"],
  SUCCESSFUL_PRODUCT: ["G-001", "G-010", "G-020", "G-030", "G-040", "G-050", "G-060", "G-070", "G-080", "G-100", "G-110", "G-120", "G-130", "G-140", "G-150", "G-200", "G-210"]
});

function fail(message) {
  throw new Error(message);
}

function exactArray(actual, expected, message) {
  if (!Array.isArray(actual) || actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) fail(message);
}

function validFieldPath(value) {
  return typeof value === "string" && /^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)*$/.test(value);
}

function validateEvidencePath(gate) {
  const pattern = gate.requiredEvidence.pathPattern;
  if (typeof pattern !== "string" || !pattern.startsWith("docs/") || !pattern.endsWith(".json") || pattern.includes("\\") || pattern.split("/").includes("..")) {
    fail(`${gate.id} 证据路径必须是项目 docs/ 内的安全JSON相对路径`);
  }
  const placeholders = [...pattern.matchAll(/<([^>]+)>/g)].map((match) => match[1]);
  if (placeholders.some((name) => !["version", "cohort", "period"].includes(name))) fail(`${gate.id} 证据路径包含未知变量`);
}

function validateAssertions(gateId, scenarioId, assertions) {
  if (!Array.isArray(assertions) || !assertions.length) fail(`${gateId} 场景 ${scenarioId} 缺少可计算断言`);
  const fingerprints = new Set();
  for (const assertion of assertions) {
    if (!validFieldPath(assertion.field)) fail(`${gateId}/${scenarioId} 断言字段无效`);
    if (!["eq", "gte", "lte", "integerGte", "ratio"].includes(assertion.operator)) fail(`${gateId}/${scenarioId} 断言运算符无效`);
    const fingerprint = JSON.stringify(assertion);
    if (fingerprints.has(fingerprint)) fail(`${gateId}/${scenarioId} 存在重复断言`);
    fingerprints.add(fingerprint);
    if (assertion.operator === "ratio") {
      if (!validFieldPath(assertion.numeratorField) || !validFieldPath(assertion.denominatorField) || assertion.numeratorField === assertion.denominatorField || Object.hasOwn(assertion, "value")) {
        fail(`${gateId}/${scenarioId} 比例断言字段无效`);
      }
    } else {
      if (!Object.hasOwn(assertion, "value")) fail(`${gateId}/${scenarioId} 断言缺少目标值`);
      if (["gte", "lte", "integerGte"].includes(assertion.operator) && (typeof assertion.value !== "number" || !Number.isFinite(assertion.value))) {
        fail(`${gateId}/${scenarioId} 数值断言目标无效`);
      }
      if (assertion.operator === "integerGte" && !Number.isSafeInteger(assertion.value)) fail(`${gateId}/${scenarioId} 整数断言目标无效`);
      if (assertion.operator === "eq" && (assertion.value === null || typeof assertion.value === "object" || (typeof assertion.value === "number" && !Number.isFinite(assertion.value)))) {
        fail(`${gateId}/${scenarioId} 等值断言必须使用有效标量`);
      }
    }
  }
  for (const assertion of assertions.filter((item) => item.operator === "ratio")) {
    if (!assertions.some((item) => item.field === assertion.field && ["gte", "lte"].includes(item.operator))) {
      fail(`${gateId}/${scenarioId} 比例断言 ${assertion.field} 缺少预注册边界`);
    }
  }
}

export function validateDevelopmentContract(contract, packageJson, measurementPolicy, options = {}) {
  if (contract.schemaVersion !== 1) fail("acceptance-gates schemaVersion 必须为 1");
  if (contract.contractId !== "MOCKUP-STUDIO-PRODUCTION-CONTRACT-1" || typeof contract.objective !== "string" || !contract.objective.trim()) fail("合同身份或目标无效");
  if (measurementPolicy.schemaVersion !== 1 || !/^MOCKUP-STUDIO-MEASUREMENT-POLICY-\d+$/.test(measurementPolicy.policyId || "") || typeof measurementPolicy.changeRule !== "string" || !measurementPolicy.changeRule.trim()) fail("测量政策身份无效");
  const registeredAt = Date.parse(measurementPolicy.registeredAt);
  if (!Number.isFinite(registeredAt)) fail("测量政策登记时间无效");
  const now = options.now instanceof Date ? options.now.getTime() : (typeof options.now === "number" ? options.now : Date.now());
  if (registeredAt > now + 5 * 60 * 1000) fail("测量政策登记时间位于未来");
  exactArray(measurementPolicy.evidenceSchema?.requiredReleaseFields, REQUIRED_RELEASE_FIELDS, "测量政策发布绑定字段不完整或顺序漂移");
  exactArray(measurementPolicy.evidenceSchema?.requiredScenarioFields, REQUIRED_SCENARIO_FIELDS, "测量政策场景字段不完整或顺序漂移");
  exactArray(measurementPolicy.evidenceSchema?.requiredAttachmentRefFields, ["path", "bytes", "sha256"], "测量政策必须固定附件路径、字节数和SHA-256");
  exactArray(measurementPolicy.evidenceSchema?.allowedStatus, ["PASS"], "人工证据只能使用PASS状态，失败或跳过不得进入通过证据");

  const serialized = JSON.stringify(contract);
  if (/"(?:status|passed|approved)"\s*:/.test(serialized)) fail("合同不得保存可手工篡改的通过状态");
  if (/\b(?:TODO|TBD|待定|稍后补充)\b/i.test(serialized)) fail("合同不得包含未定义占位项");

  exactArray(Object.keys(contract.claimLevels || {}), Object.keys(CLAIM_REQUIREMENTS), "合同必须且只能包含四个固定成熟度等级");
  for (const [claim, expected] of Object.entries(CLAIM_REQUIREMENTS)) {
    exactArray(contract.claimLevels[claim], expected, `${claim} 门禁集合或顺序漂移`);
  }

  const expectedGateIds = Object.keys(GATE_REQUIREMENTS);
  if (!Array.isArray(contract.gates)) fail("合同没有验收门禁");
  exactArray(contract.gates.map((gate) => gate.id), expectedGateIds, "合同必须且只能包含17个固定阻断门禁并保持顺序");
  const manualGateIds = [];
  for (const gate of contract.gates) {
    const expected = GATE_REQUIREMENTS[gate.id];
    if (gate.stage !== expected.stage || gate.evidenceType !== expected.evidenceType) fail(`${gate.id} 阶段或证据类型漂移`);
    for (const field of ["title", "ownerRole", "passCondition", "failCondition", "binding", "expires"]) {
      if (typeof gate[field] !== "string" || !gate[field].trim()) fail(`${gate.id} 缺少 ${field}`);
    }
    if (gate.blocking !== true) fail(`${gate.id} 必须是阻断门禁`);
    if (gate.passCondition === gate.failCondition) fail(`${gate.id} 的通过与失败条件不能相同`);
    if (gate.evidenceType === "automated") {
      if (gate.command !== expected.command) fail(`${gate.id} 自动命令漂移`);
      const scriptName = gate.command.slice("pnpm ".length);
      if (!packageJson.scripts?.[scriptName]) fail(`${gate.id} 自动命令不存在于 package.json scripts`);
    } else {
      manualGateIds.push(gate.id);
      const evidence = gate.requiredEvidence;
      if (!evidence?.pathPattern || !evidence.binding || evidence.policyRef !== `quality/measurement-policy.json#${gate.id}` || !Array.isArray(evidence.requiredScenarios) || !evidence.requiredScenarios.length || new Set(evidence.requiredScenarios).size !== evidence.requiredScenarios.length) {
        fail(`${gate.id} 人工证据必须绑定路径、版本和唯一必测场景`);
      }
      validateEvidencePath(gate);
      const policy = measurementPolicy.gates?.[gate.id];
      if (!policy?.method || !policy.scenarios || typeof policy.scenarios !== "object" || Array.isArray(policy.scenarios)) fail(`${gate.id} 缺少预注册测量政策`);
      exactArray(Object.keys(policy.scenarios), evidence.requiredScenarios, `${gate.id} 合同场景与测量政策必须逐项一致`);
      for (const scenario of evidence.requiredScenarios) validateAssertions(gate.id, scenario, policy.scenarios[scenario]?.assertions);
    }
  }
  exactArray(Object.keys(measurementPolicy.gates || {}), manualGateIds, "测量政策不得缺少或增加合同外门禁");
  return true;
}
