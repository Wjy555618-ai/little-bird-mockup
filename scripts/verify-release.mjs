import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { findBuildPlaceholders } from "./lib/build-tokens.mjs";
import { fetchBoundedJsonBytes } from "./lib/http-contract.mjs";
import { isPlausibleRemoteUrl, isReservedOrLocalHostname } from "./lib/network-policy.mjs";
import { inspectReleaseArtifact, inspectReleaseBundle, RELEASE_ARTIFACT_FILES, RELEASE_CATALOG_FILE, RELEASE_PROVENANCE_FILE } from "./lib/release-artifact.mjs";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2);

function argument(name, fallback = "") {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

const [configSource, packageSource, contractSource, policySource, catalogManifestSource] = await Promise.all([
  readFile(resolve(projectRoot, "config/plugin.config.json"), "utf8"),
  readFile(resolve(projectRoot, "package.json"), "utf8"),
  readFile(resolve(projectRoot, "quality/acceptance-gates.json"), "utf8"),
  readFile(resolve(projectRoot, "quality/measurement-policy.json")),
  readFile(resolve(projectRoot, "catalog/production/v1/manifest.json"))
]);
const config = JSON.parse(configSource);
const packageJson = JSON.parse(packageSource);
const contract = JSON.parse(contractSource);
const catalogManifest = JSON.parse(catalogManifestSource.toString("utf8"));
const measurementPolicySha256 = createHash("sha256").update(policySource).digest("hex");
const contractSha256 = createHash("sha256").update(contractSource).digest("hex");
const catalogManifestSha256 = createHash("sha256").update(catalogManifestSource).digest("hex");
const failures = [];

function command(program, commandArgs) {
  return spawnSync(program, commandArgs, { cwd: projectRoot, encoding: "utf8" });
}

function record(condition, message) {
  if (!condition) failures.push(message);
}

const requestedOutput = argument("--out-dir");
const persistentOutputRoot = requestedOutput ? resolve(projectRoot, requestedOutput) : "";
if (persistentOutputRoot) {
  const distRoot = resolve(projectRoot, "dist");
  record(persistentOutputRoot.startsWith(`${distRoot}${sep}`), "正式制品输出目录必须位于项目 dist/ 内");
  record(!(await stat(persistentOutputRoot).catch(() => null)), "正式制品输出目录已经存在；禁止覆盖既有发布制品");
}

const production = config.environments?.production || {};
let catalogUrl;
let catalogUrlIsProductionCandidate = false;
try {
  catalogUrl = new URL(production.catalogUrl);
  record(catalogUrl.protocol === "https:", "生产目录没有使用 HTTPS");
  record(!isReservedOrLocalHostname(catalogUrl.hostname), "生产目录仍是 IP、本地或保留测试域名");
  record(catalogUrl.pathname.endsWith("/manifest.json") && !catalogUrl.search && !catalogUrl.hash && !catalogUrl.username && !catalogUrl.password, "生产目录 URL 不是固定 manifest.json 地址");
  catalogUrlIsProductionCandidate = catalogUrl.protocol === "https:" && !isReservedOrLocalHostname(catalogUrl.hostname) && catalogUrl.pathname.endsWith("/manifest.json") && !catalogUrl.search && !catalogUrl.hash && !catalogUrl.username && !catalogUrl.password;
} catch {
  failures.push("生产目录 URL 无法解析");
}
record(/^\d{10,25}$/.test(production.pluginId || "") && !/^0+$/.test(production.pluginId || ""), "正式 Figma plugin ID 缺失或仍是全零占位值");
record(packageJson.version === config.pluginVersion, "package.json 与单一配置的插件版本不一致");

const status = command("git", ["status", "--porcelain", "--untracked-files=all"]);
record(status.status === 0, "无法读取 Git 工作区状态");
record(status.status === 0 && status.stdout.trim() === "", "发布必须来自无未提交文件的干净工作区");
const origin = command("git", ["config", "--get", "remote.origin.url"]);
const originIsValid = origin.status === 0 && isPlausibleRemoteUrl(origin.stdout.trim());
record(originIsValid, "发布提交必须绑定非本地、非保留域名的 origin 远端");
const revision = command("git", ["rev-parse", "HEAD"]);
const sourceRevision = revision.stdout.trim();
record(revision.status === 0 && /^[a-f0-9]{40}$/.test(sourceRevision), "无法读取发布源提交");
const sourceTag = `v${config.pluginVersion}`;
const tagRevision = command("git", ["rev-parse", "--verify", `${sourceTag}^{commit}`]);
const localTagIsValid = tagRevision.status === 0 && tagRevision.stdout.trim() === sourceRevision;
record(localTagIsValid, `当前提交缺少指向自身的 ${sourceTag} 标签`);
if (originIsValid && localTagIsValid) {
  const remoteTag = command("git", ["ls-remote", "--exit-code", "origin", `refs/tags/${sourceTag}`, `refs/tags/${sourceTag}^{}`]);
  const lines = remoteTag.stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => line.split(/\s+/, 2));
  const peeled = lines.find(([, ref]) => ref === `refs/tags/${sourceTag}^{}`)?.[0];
  const direct = lines.find(([, ref]) => ref === `refs/tags/${sourceTag}`)?.[0];
  record(remoteTag.status === 0 && (peeled || direct) === sourceRevision, `${sourceTag} 必须已发布到 origin 且解析到当前提交`);
}

const catalogCheck = command(process.execPath, ["scripts/catalog-release.mjs", "--check", "--library", "production"]);
record(catalogCheck.status === 0, `正式目录检查失败：${(catalogCheck.stderr || catalogCheck.stdout).trim()}`);
if (catalogUrlIsProductionCandidate) {
  try {
    const remoteCatalog = await fetchBoundedJsonBytes(catalogUrl.href, {
      maxBytes: config.catalogContract.maxManifestBytes,
      timeoutMs: 10000
    });
    record(Buffer.compare(Buffer.from(remoteCatalog), catalogManifestSource) === 0, "线上生产目录与本地正式manifest不是逐字节同一版本");
  } catch (error) {
    failures.push(`线上生产目录验证失败：${error.message}`);
  }
}

let artifactDigest = "";
let artifactFingerprint = "";
let publishedPath = "";
if (failures.length === 0) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "mockup-studio-release-"));
  let stagingRoot = "";
  try {
    const outputRoot = resolve(temporaryRoot, "plugin");
    const result = command(process.execPath, ["scripts/build-plugin.mjs", "--mode", "production", "--out-dir", outputRoot]);
    record(result.status === 0, `生产构建失败：${(result.stderr || result.stdout).trim()}`);
    if (result.status === 0) {
      const [ui, manifestSource, code] = await Promise.all([
        readFile(resolve(outputRoot, "ui.html"), "utf8"),
        readFile(resolve(outputRoot, "manifest.json"), "utf8"),
        readFile(resolve(outputRoot, "code.js"), "utf8")
      ]);
      const manifest = JSON.parse(manifestSource);
      const forbidden = [
        /https?:\/\/(?:localhost|127\.0\.0\.1|\[?::1\]?)(?:[\/:"'])/i,
        /https?:\/\/[^/"']+\.(?:example|invalid|test)(?:[\/:"'])/i,
        /DEV-[A-F0-9]+/
      ];
      const combinedArtifact = `${ui}\n${manifestSource}\n${code}`;
      for (const pattern of forbidden) record(!pattern.test(combinedArtifact), `生产制品包含禁用内容：${pattern}`);
      const remainingPlaceholders = findBuildPlaceholders(combinedArtifact);
      record(remainingPlaceholders.length === 0, `生产制品存在未替换令牌：${remainingPlaceholders.join(", ")}`);
      record(/REL-[A-F0-9]{12}/.test(ui), "生产制品缺少 REL 构建指纹");
      record(ui.includes(production.catalogUrl), "生产制品没有绑定正式目录 URL");
      record(manifest.id === production.pluginId, "生产 manifest plugin ID 与单一配置不一致");
      record(!Object.hasOwn(manifest.networkAccess || {}, "devAllowedDomains"), "生产 manifest 不得包含 devAllowedDomains");
      record(catalogUrl && manifest.networkAccess?.allowedDomains?.length === 1 && manifest.networkAccess.allowedDomains[0] === catalogUrl.origin, "生产 manifest 网络域名与目录来源不一致");

      const artifact = await inspectReleaseArtifact(outputRoot);
      artifactDigest = artifact.sha256;
      artifactFingerprint = artifact.fingerprint;
      const provenance = {
        schemaVersion: 1,
        provenanceType: "mockup-studio-release",
        contractId: contract.contractId,
        contractSha256,
        version: config.pluginVersion,
        sourceTag,
        sourceRevision,
        buildFingerprint: artifactFingerprint,
        artifactSha256: artifactDigest,
        measurementPolicySha256,
        catalogVersion: catalogManifest.catalogVersion,
        catalogManifestSha256,
        createdAt: new Date().toISOString()
      };
      await writeFile(resolve(outputRoot, RELEASE_CATALOG_FILE), catalogManifestSource, { flag: "wx" });
      await writeFile(resolve(outputRoot, RELEASE_PROVENANCE_FILE), `${JSON.stringify(provenance, null, 2)}\n`, { flag: "wx" });
      await inspectReleaseBundle(outputRoot, {
        version: config.pluginVersion,
        sourceRevision,
        measurementPolicySha256,
        contractId: contract.contractId,
        contractSha256
      });
      const [statusAfterBuild, revisionAfterBuild] = [
        command("git", ["status", "--porcelain", "--untracked-files=all"]),
        command("git", ["rev-parse", "HEAD"])
      ];
      record(statusAfterBuild.status === 0 && statusAfterBuild.stdout.trim() === "", "生产构建期间工作区发生变化");
      record(revisionAfterBuild.status === 0 && revisionAfterBuild.stdout.trim() === sourceRevision, "生产构建期间源提交发生变化");

      if (persistentOutputRoot && failures.length === 0) {
        await mkdir(dirname(persistentOutputRoot), { recursive: true });
        stagingRoot = await mkdtemp(join(dirname(persistentOutputRoot), ".mockup-studio-release-"));
        for (const fileName of [...RELEASE_ARTIFACT_FILES, RELEASE_CATALOG_FILE, RELEASE_PROVENANCE_FILE]) {
          await copyFile(resolve(outputRoot, fileName), resolve(stagingRoot, fileName));
        }
        await inspectReleaseBundle(stagingRoot, {
          version: config.pluginVersion,
          sourceRevision,
          measurementPolicySha256,
          contractId: contract.contractId,
          contractSha256
        });
        await rename(stagingRoot, persistentOutputRoot);
        stagingRoot = "";
        publishedPath = persistentOutputRoot;
      }
    }
  } catch (error) {
    failures.push(`正式制品封装失败：${error.message}`);
  } finally {
    if (stagingRoot) await rm(stagingRoot, { recursive: true, force: true });
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

if (failures.length) {
  console.error("RELEASE BLOCKED");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Release engineering gate PASS: ${sourceTag}, ${artifactFingerprint}, artifact sha256 ${artifactDigest}`);
  if (publishedPath) console.log(`Immutable release bundle written to ${publishedPath}`);
  console.log("注意：该结果只证明工程发布门禁；真实宿主、跨平台、人工无障碍、回滚和外部用户门禁仍需独立证据。 ");
}
