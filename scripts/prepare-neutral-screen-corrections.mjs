import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const manifest = JSON.parse(await readFile(resolve(projectRoot, "catalog/production/v1/manifest.json"), "utf8"));

function points(quad) {
  return quad.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
}

function screenCoverQuad(quad, pixels = 3) {
  const center = quad.reduce((sum, [x, y]) => [sum[0] + x / quad.length, sum[1] + y / quad.length], [0, 0]);
  return quad.map(([x, y]) => {
    const dx = x - center[0];
    const dy = y - center[1];
    const distance = Math.max(1, Math.hypot(dx, dy));
    const scale = (distance + pixels) / distance;
    return [center[0] + dx * scale, center[1] + dy * scale];
  });
}

function neutralScreenSvg(item) {
  const quad = screenCoverQuad(item.screen.aperture.quad);
  const occlusions = (item.screen.occlusions || []).map((shape) => shape.type === "circle"
    ? `<circle cx="${shape.cx}" cy="${shape.cy}" r="${shape.radius}" fill="${shape.fill || "#080808"}"/>`
    : "").join("");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${item.canvas.width}" height="${item.canvas.height}" viewBox="0 0 ${item.canvas.width} ${item.canvas.height}">
    <defs><linearGradient id="screen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#121419"/><stop offset="1" stop-color="#050607"/></linearGradient></defs>
    <polygon points="${points(quad)}" fill="url(#screen)"/>${occlusions}
  </svg>`);
}

for (const item of manifest.items) {
  const sourcePath = resolve(projectRoot, "catalog/production/v1", item.layers.base);
  const outputPath = resolve(projectRoot, "catalog/workflow/drafts", `${item.id}-neutral-off-correction.png`);
  const source = await readFile(sourcePath);
  const output = await sharp(source, { failOn: "error" })
    .composite([{ input: neutralScreenSvg(item) }])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, output);
  console.log(`${item.id}: ${outputPath}`);
}
