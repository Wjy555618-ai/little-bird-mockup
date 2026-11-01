import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

function fail(message) {
  throw new Error(message);
}

function exactArray(actual, expected, label) {
  if (!Array.isArray(actual) || actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    fail(`${label} 与冻结合同不一致`);
  }
}

function safePath(root, relativePath, label) {
  if (typeof relativePath !== "string" || !relativePath || relativePath.startsWith("/") || relativePath.includes("\\") || relativePath.split("/").includes("..")) fail(`${label} 路径无效`);
  const path = resolve(root, relativePath);
  if (path !== root && !path.startsWith(`${root}${sep}`)) fail(`${label} 路径越界`);
  return path;
}

export function validateRemoteCatalogContract(contract, pluginConfig) {
  if (contract?.schemaVersion !== 1 || contract.contractId !== "MOCKUP-REMOTE-CATALOG-CONTRACT-1") fail("远程目录合同身份无效");
  if (contract.status !== "phase-zero-netlify-static-catalog-pilot-authorized" || contract.decisionOwner !== "Wang Zhentao") fail("远程目录合同状态或决定人无效");
  if (!Array.isArray(contract.contractSources) || contract.contractSources.length !== 4) fail("远程目录合同来源不完整");
  if (contract.scope?.architectureAndGatesAuthorized !== true || contract.scope?.providerResearchAuthorized !== true) fail("当前授权范围不完整");
  for (const key of ["providerSelectionAuthorized", "domainBindingAuthorized", "githubPublicationAllowed", "figmaCommunityPublicationAllowed"]) {
    if (contract.scope?.[key] !== false) fail(`当前阶段禁止授权：${key}`);
  }
  if (contract.scope.externalDeploymentAllowed !== true || contract.scope.netlifyDeploymentAllowed !== true) fail("阶段零 Netlify 静态目录部署授权缺失");

  const architecture = contract.architecture;
  if (architecture?.model !== "vendor-neutral-static-read-only-data-plane-with-private-control-plane") fail("远程目录架构模型漂移");
  if (architecture.controlPlane?.privateOnly !== true || architecture.controlPlane?.writeCredentialsInPlugin !== false) fail("私有控制平面边界无效");
  const forbidden = ["asset-lab", "catalog/testing", "catalog/workflow", "source-code", "reference-images", "rights-records", "deployment-credentials"];
  exactArray(architecture.controlPlane.forbiddenPublishedSurfaces, forbidden, "禁止公开面");
  const dataPlane = architecture.dataPlane;
  if (dataPlane?.appliesToStage !== "long-term-production" || dataPlane.publicReadOnly !== true || dataPlane.canonicalCustomDomainRequired !== true || dataPlane.providerDomainInPluginAllowed !== false || dataPlane.protocol !== "https:" || dataPlane.manifestPath !== "/v1/manifest.json") fail("长期只读数据平面或自定义域名边界无效");
  exactArray(dataPlane.allowedMethods, ["GET", "HEAD", "OPTIONS"], "远程方法");
  exactArray(dataPlane.allowedRuntimeContentTypes, ["application/json", "image/png", "image/jpeg", "image/webp"], "运行时内容类型");
  if (dataPlane.remoteExecutableCodeAllowed !== false || dataPlane.userDesignUploadAllowed !== false || dataPlane.cookiesOrAuthorizationRequired !== false || dataPlane.corsOrigin !== "*") fail("远程代码、用户数据或鉴权边界无效");

  const pilot = contract.phaseZeroPilot;
  if (pilot?.authorized !== true || pilot.purpose !== "three-day-free-plugin-online-closed-loop" || pilot.deadlineDays !== 3 || pilot.provider !== "netlify" || pilot.plan !== "free-with-hard-credit-limit") fail("阶段零目的、时限或供应商边界无效");
  if (pilot.providerDomainAllowed !== true || pilot.customDomainRequired !== false || pilot.exactSiteOriginRequired !== true || pilot.wildcardNetlifyDomainAllowed !== false || pilot.publicCatalogOnly !== true || pilot.publishDirectory !== "dist/netlify-catalog") fail("阶段零域名或公开目录边界无效");
  if (pilot.manualDeployWithoutGit !== true || pilot.githubConnectionAllowed !== false || pilot.pluginReleaseRequiredWhenMigratingOrigin !== true || pilot.longTermProductionClaimsAllowed !== false || pilot.communitySubmissionAuthorized !== false) fail("阶段零部署或长期声明边界无效");
  exactArray(pilot.allowedPublishedContent, ["production-manifest", "active-revision-assets", "active-revision-thumbnails", "netlify-headers"], "阶段零公开文件白名单");
  exactArray(pilot.forbiddenPublishedContent, ["inactive-revisions", "approvals", "release-approvals", "asset-lab", "catalog-testing", "catalog-workflow", "source-code", "reference-images", "credentials"], "阶段零禁止公开内容");

  const deployment = contract.phaseZeroDeployment;
  if (deployment?.status !== "published-public-verification-in-progress" || deployment.siteName !== "unrivaled-cat-56bfe7" || deployment.origin !== "https://unrivaled-cat-56bfe7.netlify.app" || deployment.manifestUrl !== `${deployment.origin}/v1/manifest.json`) fail("阶段零实际部署身份无效");
  if (!/^[a-f0-9]{24}$/.test(deployment.deployId || "") || !/^sha256:[a-f0-9]{64}$/.test(deployment.candidateFingerprint || "") || !/^[a-f0-9]{64}$/.test(deployment.manifestSha256 || "") || deployment.publishedFileCount !== 12) fail("阶段零部署摘要或文件数无效");
  if (deployment.manualWithoutGit !== true || deployment.public !== true || deployment.secondDeployRequiresNewHumanApproval !== true || typeof deployment.evidencePath !== "string") fail("阶段零部署权限边界无效");
  if (pluginConfig?.environments?.production?.catalogUrl !== deployment.manifestUrl) fail("生产配置未绑定阶段零精确 manifest");
  if (pluginConfig?.environments?.pilot?.catalogUrl !== deployment.manifestUrl || pluginConfig.environments.pilot.catalogEnvironment !== "production" || pluginConfig.environments.pilot.pluginId !== "0000000000000000001" || pluginConfig.environments.pilot.pluginId === pluginConfig.environments?.development?.pluginId || pluginConfig.environments.pilot.pluginId === pluginConfig.environments?.production?.pluginId) fail("试运行配置未绑定精确 manifest 或专用本地插件身份");

  const configured = pluginConfig?.catalogContract;
  const compatibility = contract.compatibility;
  if (compatibility?.schemaVersion !== configured?.schemaVersion || compatibility.rendererVersion !== configured.rendererVersion || compatibility.maximumCatalogItems !== configured.maxItems || compatibility.maximumManifestBytes !== configured.maxManifestBytes || compatibility.maximumAssetBytes !== configured.maxAssetBytes) fail("远程目录限制与插件单一配置不一致");
  if (compatibility.compatibleAssetUpdatesRequirePluginRelease !== false || compatibility.domainSchemaRendererOrPermissionChangesRequirePluginRelease !== true) fail("插件与目录兼容边界无效");

  const cache = contract.cache;
  if (cache?.manifestCacheControl !== "no-store, max-age=0, must-revalidate" || cache.revisionedAssetCacheControl !== "public, max-age=31536000, immutable") fail("缓存合同无效");
  if (cache.maximumOfflineAgeHours !== configured.maxOfflineAgeHours || cache.sameManifestUrlAndEnvironmentRequired !== true || cache.emergencyRevocationWindowDecisionRequiredBeforeDeployment !== true || cache.instantOfflineRevocationClaimAllowed !== false) fail("离线缓存或紧急撤回边界无效");

  const protocol = contract.updateProtocol;
  if (protocol?.activation !== "atomic-manifest-last" || protocol.sameRevisionOverwriteAllowed !== false) fail("远程激活协议无效");
  exactArray(protocol.requiredOrder, [
    "freeze-approved-local-production-catalog",
    "verify-isolated-deployment-candidate",
    "record-candidate-manifest-and-file-digests",
    "upload-immutable-revisioned-resources",
    "verify-every-remote-resource",
    "atomically-activate-manifest-last",
    "verify-canonical-origin-manifest-byte-equality",
    "record-deployment-evidence",
    "start-controlled-observation-window"
  ], "远程发布顺序");
  exactArray(protocol.remoteResourceChecks, ["status-200", "content-type", "content-length", "sha256"], "远程资源检查");
  exactArray(protocol.manifestChecks, ["no-redirect", "content-type", "byte-equality", "schema", "environment", "renderer", "minimum-plugin-version"], "远程清单检查");

  const failure = contract.failurePolicy;
  for (const key of ["invalidManifest", "missingOrInvalidAsset", "timeoutOrOffline", "noValidCache", "crossOriginOrRedirect", "partialDeployment"]) if (typeof failure?.[key] !== "string" || !failure[key]) fail(`故障策略缺失：${key}`);
  const rollback = contract.rollback;
  if (rollback?.dryRunByDefault !== true || rollback.explicitApplyRequired !== true || rollback.restoreAsNewMonotonicCatalogVersion !== true || rollback.immutableResourcesNeverOverwritten !== true || rollback.maximumDetectionMinutes !== 5 || rollback.maximumRecoveryMinutes !== 15) fail("回滚与恢复目标被削弱");
  if (!Array.isArray(rollback.requiredFaults) || rollback.requiredFaults.length !== 9) fail("远程故障注入集合不完整");

  const provider = contract.providerSelection;
  if (provider?.providerUndecided !== true || !Array.isArray(provider.requiredCapabilities) || provider.requiredCapabilities.length !== 10 || !Array.isArray(provider.changeConditions) || provider.changeConditions.length !== 7) fail("供应商选择门禁不完整");
  if (provider.primaryLongTermCandidate !== "aliyun-oss-cdn" || provider.fallbackLongTermCandidate !== "tencent-cos-cdn" || provider.comparisonDocument !== "docs/REMOTE_CATALOG_PROVIDER_COMPARISON_2026-10-31.md") fail("长期供应商候选顺序或证据文档漂移");
  if (provider.targetRegion !== "Chinese mainland" || provider.futurePaidOrPrivateHorizonMonths !== 12 || provider.futureEntitlementArchitectureRequired !== true) fail("地区或商业化边界漂移");
  if (provider.plannedInitialCatalogItems !== 100 || provider.maximumInitialCatalogItems !== 200 || provider.technicalMaximumCatalogItems !== configured.maxItems || provider.catalogOrTrafficLimitIncreaseRequiresHumanDecision !== true) fail("样机规模边界漂移");
  if (provider.normalMonthlyCostTargetCny !== 30 || provider.monthlyCostReviewThresholdCny !== 50 || provider.preauthorizedMonthlyOperatingCeilingCny !== 80 || provider.ownerDeclaredMaximumMonthlyBudgetCny !== 200 || provider.monthlyCdnTrafficCapGb !== 100) fail("成本或流量边界漂移");
  exactArray(provider.trafficAlertThresholdsGb, [20, 50, 80], "流量告警阈值");
  const gates = contract.deploymentGates;
  const expectedGateIds = Array.from({ length: 10 }, (_, index) => `RC-G${String(index + 1).padStart(2, "0")}`);
  exactArray(gates?.map((gate) => gate.id), expectedGateIds, "远程上线门禁");
  for (const gate of gates) if (gate.blocking !== true || typeof gate.evidenceRequired !== "string" || !gate.evidenceRequired) fail(`${gate.id} 必须默认关闭并要求证据`);
  const pilotGates = contract.pilotDeploymentGates;
  exactArray(pilotGates?.map((gate) => gate.id), Array.from({ length: 8 }, (_, index) => `P0-G${String(index + 1).padStart(2, "0")}`), "阶段零部署门禁");
  for (const gate of pilotGates) if (gate.blocking !== true || typeof gate.evidenceRequired !== "string" || !gate.evidenceRequired) fail(`${gate.id} 必须默认关闭并要求证据`);
  exactArray(contract.unresolvedBeforePilotDeployment, [], "阶段零部署前未知项");
  if (!Array.isArray(contract.unresolvedBeforeLongTermProduction) || contract.unresolvedBeforeLongTermProduction.length !== 8) fail("长期生产部署前未知项不完整");
  return contract;
}

export async function verifyRemoteCatalogContract(projectRoot) {
  const contractPath = resolve(projectRoot, "quality/remote-catalog-contract.json");
  const configPath = resolve(projectRoot, "config/plugin.config.json");
  const [contract, pluginConfig] = await Promise.all([
    readFile(contractPath, "utf8").then(JSON.parse),
    readFile(configPath, "utf8").then(JSON.parse)
  ]);
  validateRemoteCatalogContract(contract, pluginConfig);
  for (const source of contract.contractSources) {
    if (!/^[a-f0-9]{64}$/.test(source.sha256 || "")) fail(`合同来源摘要无效：${source.path}`);
    const bytes = await readFile(safePath(projectRoot, source.path, "合同来源"));
    const actual = createHash("sha256").update(bytes).digest("hex");
    if (actual !== source.sha256) fail(`合同来源已漂移：${source.path}`);
  }
  const evidence = await readFile(safePath(projectRoot, contract.phaseZeroDeployment.evidencePath, "阶段零部署证据"), "utf8").then(JSON.parse);
  for (const field of ["siteName", "origin", "manifestUrl", "deployId", "candidateFingerprint", "manifestSha256", "publishedFileCount"]) {
    if (evidence[field] !== contract.phaseZeroDeployment[field]) fail(`阶段零部署证据不一致：${field}`);
  }
  if (evidence.secondDeployPerformed !== false || evidence.secondDeployRequiresNewHumanApproval !== true) fail("阶段零重复部署边界无效");
  return contract;
}
