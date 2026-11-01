import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyRemoteCatalogContract } from "./lib/remote-catalog-contract.mjs";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const contract = await verifyRemoteCatalogContract(projectRoot);
console.log(`remote catalog contract OK: ${contract.contractId}, ${contract.pilotDeploymentGates.length} phase-zero gates, Netlify catalog-only pilot authorized`);
