import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const assetRoot = resolve(projectRoot, "plugin/assets");
const contractPath = resolve(assetRoot, "little-bird-mockup-brand-contract.json");
const checkOnly = process.argv.includes("--check");

function fail(message) {
  throw new Error(`[brand-assets] ${message}`);
}

function parseHexColor(value, label) {
  if (!/^#[0-9A-F]{6}$/i.test(value)) fail(`${label} 必须是六位十六进制颜色`);
  return [1, 3, 5].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
}

function insideRegion(x, y, region) {
  const [left, top, width, height] = region;
  return x >= left && x < left + width && y >= top && y < top + height;
}

function matchesSelector(red, green, blue, alpha, selector) {
  if (alpha <= 20) return false;
  if (selector === "light") return red >= 160 && green >= 160 && blue >= 160;
  if (selector === "dark") return red <= 120 && green <= 120 && blue <= 120;
  fail(`未知细节选择器：${selector}`);
}

async function renderVariants() {
  const contract = JSON.parse(await readFile(contractPath, "utf8"));
  const sourcePath = resolve(assetRoot, contract.source);
  const { data, info } = await sharp(sourcePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  if (info.width !== contract.sourceSize.width || info.height !== contract.sourceSize.height || info.channels !== 4) {
    fail(`源图尺寸或通道漂移：实际 ${info.width}×${info.height}×${info.channels}`);
  }

  const masks = new Map();
  for (const [featureName, feature] of Object.entries(contract.features)) {
    const indexes = [];
    for (let y = feature.region[1]; y < feature.region[1] + feature.region[3]; y += 1) {
      for (let x = feature.region[0]; x < feature.region[0] + feature.region[2]; x += 1) {
        const index = (y * info.width + x) * 4;
        if (matchesSelector(data[index], data[index + 1], data[index + 2], data[index + 3], feature.selector)) {
          indexes.push(index);
        }
      }
    }
    if (indexes.length < feature.minimumPixels) {
      fail(`${featureName} 细节像素不足：${indexes.length} < ${feature.minimumPixels}`);
    }
    masks.set(featureName, indexes);
  }

  const detailIndexes = new Set([...masks.values()].flat());
  const outputs = new Map();
  for (const [contextName, context] of Object.entries(contract.contexts)) {
    const pixels = Buffer.from(data);
    const [red, green, blue] = parseHexColor(context.detailColor, `${contextName}.detailColor`);
    for (const index of detailIndexes) {
      pixels[index] = red;
      pixels[index + 1] = green;
      pixels[index + 2] = blue;
    }
    const output = await sharp(pixels, {
      raw: { width: info.width, height: info.height, channels: 4 }
    })
      .resize(contract.outputSize.width, contract.outputSize.height, { fit: "contain", kernel: sharp.kernel.lanczos3 })
      .png({ compressionLevel: 9 })
      .toBuffer();
    outputs.set(resolve(assetRoot, context.path), output);
  }
  return outputs;
}

const outputs = await renderVariants();
for (const [outputPath, expected] of outputs) {
  if (checkOnly) {
    const actual = await readFile(outputPath).catch(() => null);
    if (!actual || !actual.equals(expected)) fail(`品牌制品不是当前合同的确定性输出：${outputPath}`);
  } else {
    await writeFile(outputPath, expected);
  }
}

console.log(`[brand-assets] ${checkOnly ? "PASS" : "GENERATED"}: dark-ui + light-surface`);
