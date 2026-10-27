import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const pluginRoot = resolve(projectRoot, "plugin");
const require = createRequire(import.meta.url);
const pdfEntry = require.resolve("pdfjs-dist/build/pdf.mjs");
const pdfWorkerEntry = require.resolve("pdfjs-dist/build/pdf.worker.mjs");

const [template, styles, renderer, script, pdfBundle, pdfWorkerBundle] = await Promise.all([
  readFile(resolve(pluginRoot, "ui.template.html"), "utf8"),
  readFile(resolve(pluginRoot, "styles.css"), "utf8"),
  readFile(resolve(projectRoot, "shared/mockup-renderer.js"), "utf8"),
  readFile(resolve(pluginRoot, "ui.js"), "utf8"),
  build({
    entryPoints: [pdfEntry],
    bundle: true,
    format: "iife",
    globalName: "pdfjsLib",
    platform: "browser",
    target: "chrome110",
    minify: true,
    write: false
  }),
  build({
    entryPoints: [pdfWorkerEntry],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "chrome110",
    minify: true,
    write: false
  })
]);

const pdfScript = pdfBundle.outputFiles[0].text.replace(/<\/script/gi, "<\\\\/script");
const pdfWorkerSource = JSON.stringify(pdfWorkerBundle.outputFiles[0].text).replaceAll("<", "\\u003c");
const pdfWorkerScript = `window.__PDF_WORKER_SOURCE__=${pdfWorkerSource};`;

const output = template
  .replace("/*__STYLES__*/", () => styles)
  .replace("/*__PDFJS__*/", () => pdfScript)
  .replace("/*__PDF_WORKER__*/", () => pdfWorkerScript)
  .replace("/*__RENDERER__*/", () => renderer)
  .replace("/*__SCRIPT__*/", () => script);

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
