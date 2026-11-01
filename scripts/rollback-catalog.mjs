import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { rollbackCatalog } from "./lib/catalog-history.mjs";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2);
const value = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : "";
};

const result = await rollbackCatalog(projectRoot, {
  library: value("--library") || "production",
  toVersion: value("--to"),
  nextVersion: value("--version"),
  apply: args.includes("--apply")
});

if (result.applied) {
  console.log(`目录回滚已写入：${result.currentVersion} -> ${result.restoredVersion}，新发布版本 ${result.nextVersion}`);
  console.log("仍需运行 pnpm check、部署、验证线上 manifest，并记录 G-150 演练证据。");
} else {
  console.log(`目录回滚演练通过：${result.currentVersion} -> ${result.restoredVersion}，计划发布为 ${result.nextVersion}`);
  console.log("未修改任何文件；确认后显式追加 --apply。 ");
}
