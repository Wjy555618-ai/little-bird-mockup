import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const [template, styles] = await Promise.all([
  readFile(resolve(projectRoot, "plugin/ui.template.html"), "utf8"),
  readFile(resolve(projectRoot, "plugin/styles.css"), "utf8")
]);

function fail(message) {
  throw new Error(message);
}

function rgb(hex) {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
}

function luminance(hex) {
  return rgb(hex)
    .map((channel) => channel / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
}

function contrast(foreground, background) {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

if (!/<div class="search-field" role="search">[\s\S]*id="searchInput"[^>]*aria-label="搜索样机"/.test(template)) {
  fail("搜索框必须使用独立 search 区域和明确的可访问名称");
}
if (/<label class="search-field">/.test(template)) fail("搜索清除按钮不得嵌套在 input label 中");
if (!/\[role="button"\]:focus-visible\s*\{[^}]*outline:\s*2px/.test(styles)) fail("自定义按钮必须拥有至少 2px 的可见焦点");

for (const foreground of ["#aaa9af", "#94939a"]) {
  for (const background of ["#151515", "#1a1a1a", "#1b1b1b", "#202020"]) {
    const ratio = contrast(foreground, background);
    if (ratio < 4.5) fail(`${foreground} / ${background} 对比度仅 ${ratio.toFixed(2)}:1`);
  }
}

console.log("Static accessibility OK: semantics, focus visibility, and text contrast >= 4.5:1");
