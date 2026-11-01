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

function relativeLuminance([red, green, blue]) {
  const channels = [red, green, blue].map((value) => {
    const normalized = value / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
}

function contrastRatio(first, second) {
  const light = Math.max(relativeLuminance(first), relativeLuminance(second));
  const dark = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (light + 0.05) / (dark + 0.05);
}

function matchesTargetColor(red, green, blue, target, tolerance = 96) {
  return Math.max(
    Math.abs(red - target[0]),
    Math.abs(green - target[1]),
    Math.abs(blue - target[2])
  ) <= tolerance;
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
  if (contract.schemaVersion !== 2) fail(`不支持的品牌合同版本：${contract.schemaVersion}`);
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
  if (detailIndexes.size === 0) fail("品牌合同没有可着色的语义细节");
  const outputs = new Map();
  for (const [contextName, context] of Object.entries(contract.contexts)) {
    const pixels = Buffer.from(data);
    const surfaceColor = parseHexColor(context.surfaceColor, `${contextName}.surfaceColor`);
    for (const [featureName, indexes] of masks) {
      const featureColor = parseHexColor(context.featureColors?.[featureName], `${contextName}.featureColors.${featureName}`);
      const ratio = contrastRatio(featureColor, surfaceColor);
      if (ratio < context.minimumContrastRatio) {
        fail(`${contextName}.${featureName} 与使用背景的对比度不足：${ratio.toFixed(2)} < ${context.minimumContrastRatio}`);
      }
      for (const index of indexes) {
        pixels[index] = featureColor[0];
        pixels[index + 1] = featureColor[1];
        pixels[index + 2] = featureColor[2];
      }
    }
    const output = await sharp(pixels, {
      raw: { width: info.width, height: info.height, channels: 4 }
    })
      .resize(contract.outputSize.width, contract.outputSize.height, { fit: "contain", kernel: sharp.kernel.lanczos3 })
      .png({ compressionLevel: 9 })
      .toBuffer();

    for (const usageSize of context.usageSizes) {
      const { data: usagePixels, info: usageInfo } = await sharp(output)
        .resize(usageSize, usageSize, { fit: "contain", kernel: sharp.kernel.lanczos3 })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const scale = usageSize / contract.sourceSize.width;
      for (const [featureName, feature] of Object.entries(contract.features)) {
        const target = parseHexColor(context.featureColors[featureName], `${contextName}.featureColors.${featureName}`);
        const [sourceX, sourceY, sourceWidth, sourceHeight] = feature.region;
        const left = Math.max(0, Math.floor(sourceX * scale));
        const top = Math.max(0, Math.floor(sourceY * scale));
        const right = Math.min(usageInfo.width, Math.ceil((sourceX + sourceWidth) * scale));
        const bottom = Math.min(usageInfo.height, Math.ceil((sourceY + sourceHeight) * scale));
        let visiblePixels = 0;
        for (let y = top; y < bottom; y += 1) {
          for (let x = left; x < right; x += 1) {
            const index = (y * usageInfo.width + x) * 4;
            const [red, green, blue, alpha] = usagePixels.subarray(index, index + 4);
            if (alpha >= 96 && matchesTargetColor(red, green, blue, target)) visiblePixels += 1;
          }
        }
        if (visiblePixels < context.minimumVisiblePixels) {
          fail(`${contextName}.${featureName} 在 ${usageSize}px 下不可辨识：${visiblePixels} < ${context.minimumVisiblePixels}`);
        }
      }
    }
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
