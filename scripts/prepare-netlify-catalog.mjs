import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareNetlifyCatalogCandidate, verifyNetlifyCatalogCandidate } from "./lib/netlify-catalog-candidate.mjs";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2);
const outputIndex = args.indexOf("--out-dir");
const outputRoot = resolve(projectRoot, outputIndex >= 0 ? args[outputIndex + 1] : "dist/netlify-catalog");
const distRoot = resolve(projectRoot, "dist");
if (outputRoot !== distRoot && !outputRoot.startsWith(`${distRoot}${sep}`)) throw new Error("Netlify 候选输出必须位于项目 dist/ 内");

const catalogCheck = spawnSync(process.execPath, ["scripts/catalog-release.mjs", "--check", "--library", "production"], { cwd: projectRoot, encoding: "utf8" });
if (catalogCheck.status !== 0) throw new Error(`正式目录检查失败：${(catalogCheck.stderr || catalogCheck.stdout).trim()}`);

if (args.includes("--check")) {
  const verified = await verifyNetlifyCatalogCandidate({ projectRoot, outputRoot });
  console.log(`Netlify catalog candidate OK: ${verified.catalogVersion}, ${verified.itemCount} items, ${verified.files.length} files`);
} else {
  const result = await prepareNetlifyCatalogCandidate({ projectRoot, outputRoot });
  await mkdir(dirname(outputRoot), { recursive: true });
  await writeFile(`${outputRoot}.json`, `${JSON.stringify({ ...result, createdAt: new Date().toISOString() }, null, 2)}\n`);
  console.log(`Netlify catalog candidate prepared: ${outputRoot}`);
  console.log(`catalog ${result.catalogVersion}, ${result.itemCount} items, ${result.fileCount} files, sha256:${result.candidateSha256}`);
}
