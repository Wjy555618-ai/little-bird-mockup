import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateDependabotConfig, validateQualityWorkflow } from "./lib/ci-contract.mjs";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const workflowPath = resolve(projectRoot, ".github/workflows/quality.yml");
validateQualityWorkflow(await readFile(workflowPath, "utf8"));
validateDependabotConfig(await readFile(resolve(projectRoot, ".github/dependabot.yml"), "utf8"));
console.log("CI contract OK: least privilege, immutable actions, weekly refresh, dependency updates, blocking checks, and retained REL bundle");
