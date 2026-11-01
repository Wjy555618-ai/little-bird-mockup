import sharp from "sharp";

const DEFAULT_MAXIMUM_GREEN_RATIO = 0.85;
const DEFAULT_MAXIMUM_NEUTRAL_MEAN_CHROMA = 20;

function fail(message) {
  throw new Error(message);
}

function pointInPolygon(x, y, polygon) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const [x1, y1] = polygon[index];
    const [x2, y2] = polygon[previous];
    const intersects = (y1 > y) !== (y2 > y)
      && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function assertNoChromaSchema(item) {
  if (item?.renderer !== "static-screen-v5") fail(`${item?.id || "unknown"} 必须使用 static-screen-v5`);
  if (item?.screen?.compositing?.mode !== "aperture-mask") fail(`${item.id} 必须使用显式孔径遮罩`);
  if (Object.hasOwn(item, "chromaKey")) fail(`${item.id} 禁止包含 chromaKey`);
  if (Object.hasOwn(item.screen || {}, "underlap") || Object.hasOwn(item.screen || {}, "bleed")) fail(`${item.id} 禁止包含色键衬底字段`);
  if (Object.hasOwn(item.screen?.compositing || {}, "maxEdgeExtension")) fail(`${item.id} 禁止包含色键边缘扩展字段`);
  const presentation = item.screen?.presentation;
  if (!presentation || !["neutral-off", "reference-bound"].includes(presentation.mode)) {
    fail(`${item.id} 必须声明屏幕展示来源为 neutral-off 或 reference-bound`);
  }
  if (presentation.mode === "reference-bound") {
    if (!/^[a-f0-9]{64}$/.test(presentation.referenceSha256 || "")
      || presentation.referenceSha256 !== item.provenance?.referenceSha256) {
      fail(`${item.id} 的屏幕画面没有绑定准确参考图摘要`);
    }
  }
  return true;
}

export async function analyzeCompleteBase(input, item, options = {}) {
  assertNoChromaSchema(item);
  const maximumGreenRatio = Number.isFinite(options.maximumGreenRatio)
    ? options.maximumGreenRatio
    : DEFAULT_MAXIMUM_GREEN_RATIO;
  const maximumNeutralMeanChroma = Number.isFinite(options.maximumNeutralMeanChroma)
    ? options.maximumNeutralMeanChroma
    : DEFAULT_MAXIMUM_NEUTRAL_MEAN_CHROMA;
  const { data, info } = await sharp(input, { failOn: "error" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.width !== item.canvas.width || info.height !== item.canvas.height) fail(`${item.id} 底图尺寸与清单不一致`);
  const polygon = item.screen.aperture.quad;
  const step = Math.max(1, Number(options.sampleStep) || 2);
  let sampledPixels = 0;
  let greenDominantPixels = 0;
  let chromaSum = 0;
  for (let y = 0; y < info.height; y += step) {
    for (let x = 0; x < info.width; x += step) {
      if (!pointInPolygon(x + 0.5, y + 0.5, polygon)) continue;
      const offset = (y * info.width + x) * 4;
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      sampledPixels += 1;
      chromaSum += Math.max(red, green, blue) - Math.min(red, green, blue);
      if (green >= 80 && green - red >= 30 && green - blue >= 30) greenDominantPixels += 1;
    }
  }
  const greenDominantRatio = sampledPixels ? greenDominantPixels / sampledPixels : 1;
  const meanChroma = sampledPixels ? chromaSum / sampledPixels : 255;
  const presentationMode = item.screen.presentation.mode;
  const presentationPass = presentationMode === "reference-bound" || meanChroma <= maximumNeutralMeanChroma;
  return {
    pass: sampledPixels > 0 && greenDominantRatio < maximumGreenRatio && presentationPass,
    mode: "aperture-mask",
    detector: "complete-screen-provenance-v2",
    sampledPixels,
    greenDominantPixels,
    greenDominantRatio,
    maximumGreenRatio,
    presentationMode,
    meanChroma,
    maximumNeutralMeanChroma,
    presentationPass
  };
}

export function assertCompleteBaseMetrics(item, metrics, confirmation = null, options = {}) {
  if (!metrics || metrics.mode !== "aperture-mask" || metrics.detector !== "complete-screen-provenance-v2") {
    fail(`${item.id} 缺少有效的完整底图检测结果`);
  }
  if (metrics.presentationPass !== true) {
    fail(`${item.id} 的 neutral-off 屏幕包含明显彩色界面；禁止把未绑定参考图的生成内容烘进样机`);
  }
  if (metrics.pass === true) return { ...metrics, resolution: "automatic" };
  if (confirmation?.completeBaseConfirmed === true && confirmation.candidateSha256 === item.integrity?.baseSha256) {
    return { ...metrics, pass: true, technicalPass: true, resolution: "final-batch-human-confirmation" };
  }
  if (options.allowPendingFinalDecision === true) {
    return { ...metrics, technicalPass: true, resolution: "final-batch-decision-required" };
  }
  fail(`${item.id} 底图疑似色键占位板；如为自然绿色完整设计，必须在最终批次决定中绑定准确底图摘要确认`);
}
