import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyCatalogHistory } from "./lib/catalog-history.mjs";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const result = await verifyCatalogHistory(projectRoot, "production");
console.log(`Catalog rollback inventory OK: ${result.version}`);
