import { isAbsolute, resolve, sep } from "node:path";

function fail(message) {
  throw new Error(message);
}

export function resolveContractEvidencePath(projectRoot, gate, document) {
  const pattern = gate.requiredEvidence.pathPattern;
  if (typeof pattern !== "string" || isAbsolute(pattern) || !pattern.startsWith("docs/") || pattern.includes("\\") || pattern.split("/").includes("..")) fail(`${gate.id} 证据路径不安全`);
  let relativePath = pattern.replaceAll("<version>", document.release?.version || "");
  if (/<(?:cohort|period)>/.test(relativePath)) {
    if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(document.evidenceScope || "")) fail(`${gate.id} evidenceScope 无效`);
    relativePath = relativePath.replace(/<(?:cohort|period)>/g, document.evidenceScope);
  }
  if (/<[^>]+>/.test(relativePath)) fail(`${gate.id} 证据路径仍有未解析变量`);
  const root = resolve(projectRoot);
  const output = resolve(root, relativePath);
  if (!output.startsWith(`${root}${sep}`)) fail(`${gate.id} 证据路径逃逸项目目录`);
  return output;
}

function setField(target, path, value) {
  const keys = path.split(".");
  let cursor = target;
  for (const key of keys.slice(0, -1)) cursor = cursor[key] ||= {};
  cursor[keys.at(-1)] = value;
}

export function createEvidenceDraft({ gate, gatePolicy, evidenceId, evidenceScope, measurementPolicySha256, release }) {
  if (!/^[A-Z0-9][A-Z0-9._-]{2,79}$/.test(evidenceId || "")) fail("evidenceId 必须是3至80位大写字母、数字、点、下划线或连字符");
  const document = {
    schemaVersion: 1,
    gateId: gate.id,
    evidenceId,
    ...(evidenceScope ? { evidenceScope } : {}),
    measurementPolicySha256,
    createdAt: null,
    ownerRole: gate.ownerRole,
    release: { ...release },
    scenarios: gate.requiredEvidence.requiredScenarios.map((id) => {
      const measurements = {};
      for (const assertion of gatePolicy.scenarios[id].assertions) {
        setField(measurements, assertion.field, null);
        if (assertion.operator === "ratio") {
          setField(measurements, assertion.numeratorField, null);
          setField(measurements, assertion.denominatorField, null);
        }
      }
      return {
        id,
        status: "NOT_RUN",
        startedAt: null,
        finishedAt: null,
        environment: {},
        input: {},
        result: {},
        measurements,
        evidenceRefs: []
      };
    })
  };
  return document;
}
