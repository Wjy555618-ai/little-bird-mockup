import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { createEvidenceDraft, resolveContractEvidencePath } from "../scripts/lib/evidence-contract.mjs";

const gate = {
  id: "G-210",
  ownerRole: "product owner",
  requiredEvidence: {
    pathPattern: "docs/product-evidence/<period>/success-metrics.json",
    requiredScenarios: ["activation"]
  }
};
const gatePolicy = {
  scenarios: {
    activation: {
      assertions: [
        { field: "eligibleUsers", operator: "integerGte", value: 100 },
        { field: "activatedUsers", operator: "integerGte", value: 0 },
        { field: "rate", operator: "ratio", numeratorField: "activatedUsers", denominatorField: "eligibleUsers" }
      ]
    }
  }
};

test("evidence draft derives exact paths and all measurement fields while remaining fail-closed", () => {
  const document = createEvidenceDraft({
    gate,
    gatePolicy,
    evidenceId: "SUCCESS-2026-11",
    evidenceScope: "2026-11",
    measurementPolicySha256: "a".repeat(64),
    release: { version: "0.1.0" }
  });
  assert.equal(document.scenarios[0].status, "NOT_RUN");
  assert.equal(document.createdAt, null);
  assert.deepEqual(document.scenarios[0].measurements, { eligibleUsers: null, activatedUsers: null, rate: null });
  assert.deepEqual(document.scenarios[0].evidenceRefs, []);
  assert.equal(resolveContractEvidencePath("/project", gate, document), resolve("/project/docs/product-evidence/2026-11/success-metrics.json"));
});

test("evidence draft rejects unsafe identifiers and unresolved product scopes", () => {
  assert.throws(() => createEvidenceDraft({ gate, gatePolicy, evidenceId: "bad id", measurementPolicySha256: "a".repeat(64), release: { version: "0.1.0" } }), /evidenceId/);
  const document = createEvidenceDraft({ gate, gatePolicy, evidenceId: "SUCCESS-VALID", measurementPolicySha256: "a".repeat(64), release: { version: "0.1.0" } });
  assert.throws(() => resolveContractEvidencePath("/project", gate, document), /evidenceScope/);
  const escapingGate = structuredClone(gate);
  escapingGate.requiredEvidence.pathPattern = "../outside.json";
  assert.throws(() => resolveContractEvidencePath("/project", escapingGate, { ...document, evidenceScope: "2026-11" }), /不安全/);
});
