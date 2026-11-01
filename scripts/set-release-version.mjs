import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const requestedVersion = process.argv[2] || "";
const semanticVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function fail(message) {
  console.error(`VERSION UPDATE BLOCKED\n- ${message}`);
  process.exit(1);
}

function compareVersions(left, right) {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
  }
  return 0;
}

if (!semanticVersionPattern.test(requestedVersion)) {
  fail("用法：pnpm release:version <major.minor.patch>");
}

const packagePath = resolve(projectRoot, "package.json");
const configPath = resolve(projectRoot, "config/plugin.config.json");
const [packageSource, configSource] = await Promise.all([
  readFile(packagePath, "utf8"),
  readFile(configPath, "utf8")
]);
const packageJson = JSON.parse(packageSource);
const config = JSON.parse(configSource);

if (packageJson.version !== config.pluginVersion) {
  fail("当前 package.json 与 plugin.config.json 版本已经漂移，必须先人工审计");
}
if (!semanticVersionPattern.test(packageJson.version || "")) {
  fail("当前插件版本不是合法语义版本");
}
if (compareVersions(requestedVersion, packageJson.version) <= 0) {
  fail(`新版本必须高于当前版本 ${packageJson.version}`);
}

packageJson.version = requestedVersion;
config.pluginVersion = requestedVersion;
const temporaryPackagePath = `${packagePath}.version-update`;
const temporaryConfigPath = `${configPath}.version-update`;

try {
  await Promise.all([
    writeFile(temporaryPackagePath, `${JSON.stringify(packageJson, null, 2)}\n`, { flag: "wx" }),
    writeFile(temporaryConfigPath, `${JSON.stringify(config, null, 2)}\n`, { flag: "wx" })
  ]);
  await rename(temporaryPackagePath, packagePath);
  await rename(temporaryConfigPath, configPath);
} catch (error) {
  await Promise.all([
    rm(temporaryPackagePath, { force: true }),
    rm(temporaryConfigPath, { force: true })
  ]);
  fail(`无法写入版本文件：${error.message}`);
}

console.log(`Release version updated: ${requestedVersion}`);
