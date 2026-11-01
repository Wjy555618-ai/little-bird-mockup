import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promoteAssets } from "./lib/asset-pipeline.mjs";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2);
const idIndex = args.indexOf("--id");
const requestedId = idIndex >= 0 ? args[idIndex + 1] : null;
const promoteAll = args.includes("--all");

if (!requestedId && !promoteAll) throw new Error("请使用 --id <assetId> 或 --all 指定要发布的样机");
const result = await promoteAssets(projectRoot, { assetId: requestedId, all: promoteAll });
for (const item of result.promoted) console.log(`已提升：${item.name} (${item.assetId} r${item.revision})`);
console.log(`本地正式库版本：${result.catalogVersion}，共 ${result.itemCount} 个样机`);
console.log("外部发布仍被当前合同禁止。");
