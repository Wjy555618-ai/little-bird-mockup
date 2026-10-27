import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const pluginRoot = resolve(projectRoot, "plugin");
const [template, styles, script] = await Promise.all([
  readFile(resolve(pluginRoot, "ui.template.html"), "utf8"),
  readFile(resolve(pluginRoot, "styles.css"), "utf8"),
  readFile(resolve(pluginRoot, "ui.js"), "utf8")
]);

const output = template
  .replace("/*__STYLES__*/", styles)
  .replace("/*__SCRIPT__*/", script);

if (process.argv.includes("--check")) {
  const current = await readFile(resolve(pluginRoot, "ui.html"), "utf8").catch(() => "");
  if (current !== output) {
    console.error("plugin/ui.html is stale. Run npm run build.");
    process.exitCode = 1;
  }
} else {
  await writeFile(resolve(pluginRoot, "ui.html"), output);
  console.log("Built plugin/ui.html");
}
