import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateDevelopmentContract } from "./lib/contract-policy.mjs";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const contract = JSON.parse(await readFile(resolve(projectRoot, "quality/acceptance-gates.json"), "utf8"));
const packageJson = JSON.parse(await readFile(resolve(projectRoot, "package.json"), "utf8"));
const measurementPolicy = JSON.parse(await readFile(resolve(projectRoot, "quality/measurement-policy.json"), "utf8"));

validateDevelopmentContract(contract, packageJson, measurementPolicy);

console.log(`Development contract OK: ${contract.gates.length} blocking gates, ${Object.keys(contract.claimLevels).length} claim levels`);
