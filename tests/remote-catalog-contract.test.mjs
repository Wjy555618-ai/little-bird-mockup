import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { validateRemoteCatalogContract, verifyRemoteCatalogContract } from "../scripts/lib/remote-catalog-contract.mjs";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const contract = JSON.parse(await readFile(resolve(projectRoot, "quality/remote-catalog-contract.json"), "utf8"));
const config = JSON.parse(await readFile(resolve(projectRoot, "config/plugin.config.json"), "utf8"));

test("remote catalog contract authorizes only the three-day Netlify catalog pilot while preserving the long-term architecture", async () => {
  const verified = await verifyRemoteCatalogContract(projectRoot);
  assert.equal(verified.contractId, "MOCKUP-REMOTE-CATALOG-CONTRACT-1");
  assert.equal(verified.scope.externalDeploymentAllowed, true);
  assert.equal(verified.scope.netlifyDeploymentAllowed, true);
  assert.equal(verified.scope.githubPublicationAllowed, false);
  assert.equal(verified.scope.figmaCommunityPublicationAllowed, false);
  assert.equal(verified.phaseZeroPilot.publishDirectory, "dist/netlify-catalog");
  assert.equal(verified.phaseZeroDeployment.origin, "https://unrivaled-cat-56bfe7.netlify.app");
  assert.equal(verified.phaseZeroDeployment.deployId, "6ae5de9c8a03867857235639");
  assert.equal(verified.phaseZeroDeployment.secondDeployRequiresNewHumanApproval, true);
  assert.deepEqual(verified.unresolvedBeforePilotDeployment, []);
  assert.equal(config.environments.pilot.catalogUrl, verified.phaseZeroDeployment.manifestUrl);
  assert.equal(config.environments.pilot.pluginId, "0000000000000000001");
  assert.notEqual(config.environments.pilot.pluginId, config.environments.development.pluginId);
  assert.equal(verified.pilotDeploymentGates.length, 8);
  assert.equal(verified.deploymentGates.length, 10);
  assert.equal(verified.providerSelection.primaryLongTermCandidate, "aliyun-oss-cdn");
  assert.equal(verified.providerSelection.plannedInitialCatalogItems, 100);
  assert.equal(verified.providerSelection.maximumInitialCatalogItems, 200);
  assert.equal(verified.providerSelection.technicalMaximumCatalogItems, config.catalogContract.maxItems);
  assert.equal(verified.providerSelection.normalMonthlyCostTargetCny, 30);
  assert.equal(verified.providerSelection.monthlyCdnTrafficCapGb, 100);
});

test("remote catalog contract rejects permission, trust, atomicity, recovery and limit drift", () => {
  const cases = [
    ["remove pilot deployment authorization", (value) => { value.scope.externalDeploymentAllowed = false; }, /授权缺失/],
    ["expand to GitHub", (value) => { value.scope.githubPublicationAllowed = true; }, /禁止授权/],
    ["expand to Community", (value) => { value.scope.figmaCommunityPublicationAllowed = true; }, /禁止授权/],
    ["publish raw production tree", (value) => { value.phaseZeroPilot.publishDirectory = "catalog/production"; }, /公开目录/],
    ["allow inactive revisions", (value) => { value.phaseZeroPilot.forbiddenPublishedContent.shift(); }, /禁止公开内容/],
    ["allow wildcard Netlify", (value) => { value.phaseZeroPilot.wildcardNetlifyDomainAllowed = true; }, /域名/],
    ["provider binding", (value) => { value.architecture.dataPlane.providerDomainInPluginAllowed = true; }, /数据平面/],
    ["write method", (value) => { value.architecture.dataPlane.allowedMethods.push("POST"); }, /远程方法/],
    ["remote code", (value) => { value.architecture.dataPlane.remoteExecutableCodeAllowed = true; }, /远程代码/],
    ["user design upload", (value) => { value.architecture.dataPlane.userDesignUploadAllowed = true; }, /用户数据/],
    ["manifest activation order", (value) => { value.updateProtocol.requiredOrder.reverse(); }, /发布顺序/],
    ["same revision overwrite", (value) => { value.updateProtocol.sameRevisionOverwriteAllowed = true; }, /激活协议/],
    ["offline age drift", (value) => { value.cache.maximumOfflineAgeHours = 999; }, /离线缓存/],
    ["instant revocation claim", (value) => { value.cache.instantOfflineRevocationClaimAllowed = true; }, /紧急撤回/],
    ["slow recovery", (value) => { value.rollback.maximumRecoveryMinutes = 60; }, /回滚/],
    ["missing blocking gate", (value) => { value.deploymentGates.pop(); }, /上线门禁/],
    ["non-blocking deployment gate", (value) => { value.deploymentGates[0].blocking = false; }, /默认关闭/],
    ["plugin limit drift", (value) => { value.compatibility.maximumCatalogItems = 501; }, /单一配置/]
    ,["provider shortlist drift", (value) => { value.providerSelection.primaryLongTermCandidate = "unknown"; }, /候选顺序/]
    ,["catalog operating limit drift", (value) => { value.providerSelection.maximumInitialCatalogItems = 500; }, /样机规模/]
    ,["budget drift", (value) => { value.providerSelection.normalMonthlyCostTargetCny = 31; }, /成本/]
    ,["traffic cap drift", (value) => { value.providerSelection.monthlyCdnTrafficCapGb = 500; }, /成本|流量/]
    ,["traffic alert drift", (value) => { value.providerSelection.trafficAlertThresholdsGb = [60, 80, 90]; }, /流量告警/]
  ];
  for (const [label, mutate, pattern] of cases) {
    const value = structuredClone(contract);
    mutate(value);
    assert.throws(() => validateRemoteCatalogContract(value, config), pattern, label);
  }
});
