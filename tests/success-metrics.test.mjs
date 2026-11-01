import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { contractSha256, measurementPolicySha256, validateEvidenceDocument } from "../scripts/verify-evidence.mjs";

const currentVersion = JSON.parse(readFileSync(new URL("../config/plugin.config.json", import.meta.url), "utf8")).pluginVersion;
const release = {
  version: currentVersion,
  fingerprint: "REL-123456789ABC",
  sourceRevision: "a".repeat(40),
  artifactSha256: "b".repeat(64),
  contractSha256,
  catalogVersion: "2026.10.30.2",
  catalogManifestSha256: "c".repeat(64)
};
const attachment = { path: "raw.json", bytes: 1, sha256: "d".repeat(64) };

function scenario(id, measurements) {
  return {
    id,
    status: "PASS",
    startedAt: "2026-11-01T00:00:00.000Z",
    finishedAt: "2026-11-01T00:01:00.000Z",
    environment: { source: "production analytics export" },
    input: { cohort: "external-users-2026-11" },
    result: { queryRows: 1 },
    measurements,
    evidenceRefs: [{ ...attachment }]
  };
}

function validSuccessEvidence() {
  return {
    schemaVersion: 1,
    gateId: "G-210",
    evidenceId: "SUCCESS-2026-11",
    evidenceScope: "2026-11",
    measurementPolicySha256,
    createdAt: "2026-11-01T01:00:00.000Z",
    ownerRole: "product owner",
    release: { ...release },
    scenarios: [
      scenario("activation", { eligibleUsers: 100, activatedUsers: 70, rate: 0.7 }),
      scenario("time-to-first-success", { sampleUsers: 100, medianSeconds: 180, p90Seconds: 480 }),
      scenario("error-free-session", { eligibleSessions: 100, errorFreeSessions: 99, rate: 0.99 }),
      scenario("retention", { observationDays: 28, eligibleUsers: 100, day7RetainedUsers: 25, day7Rate: 0.25, day28RetainedUsers: 15, day28Rate: 0.15 }),
      scenario("repeat-use", { eligibleUsers: 100, day7RepeatUsers: 35, day7Rate: 0.35 }),
      scenario("support-rate", { eligibleUsers: 100, blockingIncidents: 2, blockingIncidentRate: 0.02 }),
      scenario("data-quality", { expectedEvents: 100, validEvents: 95, eventCoverage: 0.95, receivedEvents: 100, duplicateEvents: 1, duplicateRate: 0.01, unknownDenominators: 0 })
    ]
  };
}

function validate(document) {
  return validateEvidenceDocument(document, {
    gateId: "G-210",
    version: release.version,
    fingerprint: release.fingerprint,
    sourceRevision: release.sourceRevision,
    artifactSha256: release.artifactSha256,
    contractSha256: release.contractSha256,
    catalogVersion: release.catalogVersion,
    catalogManifestSha256: release.catalogManifestSha256,
    now: new Date("2026-11-02T00:00:00.000Z"),
    enforcePath: false,
    checkFiles: false
  });
}

test("success metrics pass only with bounded rates derived from integer numerators and denominators", async () => {
  assert.equal(await validate(validSuccessEvidence()), true);
});

test("success metrics reject inconsistent rates, values above one and non-integer denominators", async () => {
  const inconsistent = validSuccessEvidence();
  inconsistent.scenarios[0].measurements.rate = 0.8;
  await assert.rejects(validate(inconsistent), /rate ratio activatedUsers\/eligibleUsers/);

  const aboveOne = validSuccessEvidence();
  aboveOne.scenarios[0].measurements.activatedUsers = 200;
  aboveOne.scenarios[0].measurements.rate = 2;
  await assert.rejects(validate(aboveOne), /rate lte 1/);

  const fractionalDenominator = validSuccessEvidence();
  fractionalDenominator.scenarios[0].measurements.eligibleUsers = 100.5;
  await assert.rejects(validate(fractionalDenominator), /eligibleUsers integerGte 100/);
});
