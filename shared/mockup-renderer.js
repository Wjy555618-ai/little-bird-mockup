(function attachMockupRenderer(global) {
  "use strict";

  const VERSION = "2.1.0";
  const DEFAULT_ADJUSTMENTS = Object.freeze({ scale: 1, offsetX: 0, offsetY: 0, rotation: 0, brightness: 1, contrast: 1, saturation: 1 });
  const baseCanvasCache = new WeakMap();

  function validateAsset(asset) {
    if (!asset || !asset.id || !asset.name) throw new Error("样机缺少 id 或名称");
    if (!["static-screen-v1", "static-screen-v2"].includes(asset.renderer)) throw new Error(`${asset.id} 渲染器不受支持`);
    if (!Number.isFinite(asset.canvas?.width) || !Number.isFinite(asset.canvas?.height)) throw new Error(`${asset.id} 画布尺寸无效`);
    if (!Array.isArray(asset.screen?.quad) || asset.screen.quad.length !== 4) throw new Error(`${asset.id} 屏幕必须有四个顶点`);
    for (const point of asset.screen.quad) {
      if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)) throw new Error(`${asset.id} 存在无效顶点`);
      if (point[0] < 0 || point[0] > asset.canvas.width || point[1] < 0 || point[1] > asset.canvas.height) throw new Error(`${asset.id} 屏幕顶点超出画布`);
    }
    if (!asset.layers?.base) throw new Error(`${asset.id} 缺少基础图层`);
    if (!Number.isInteger(asset.screen?.recommendedSize?.width) || !Number.isInteger(asset.screen?.recommendedSize?.height) || asset.screen.recommendedSize.width < 1 || asset.screen.recommendedSize.height < 1) {
      throw new Error(`${asset.id} 缺少有效的推荐画面尺寸`);
    }
    if (!asset.screen.recommendedSize.label) throw new Error(`${asset.id} 缺少推荐画面比例说明`);
    if (asset.screen.bleed != null && (!Number.isFinite(asset.screen.bleed) || asset.screen.bleed < 0 || asset.screen.bleed > 24)) throw new Error(`${asset.id} 屏幕出血无效`);
    return asset;
  }

  function preparedBaseImage(image, asset) {
    if (!asset.chromaKey?.enabled) return image;
    const cached = baseCanvasCache.get(image);
    if (cached) return cached;
    const canvas = document.createElement("canvas");
    canvas.width = asset.canvas.width;
    canvas.height = asset.canvas.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const replacement = asset.chromaKey.replacement || [12, 12, 12];
    const minimumGreen = asset.chromaKey.minimumGreen || 65;
    const dominance = asset.chromaKey.dominance || 1.18;
    for (let index = 0; index < pixels.data.length; index += 4) {
      const red = pixels.data[index];
      const green = pixels.data[index + 1];
      const blue = pixels.data[index + 2];
      if (green >= minimumGreen && green > red * dominance && green > blue * dominance) {
        const shade = Math.max(0.35, Math.min(1, green / 255));
        pixels.data[index] = Math.round(replacement[0] * shade);
        pixels.data[index + 1] = Math.round(replacement[1] * shade);
        pixels.data[index + 2] = Math.round(replacement[2] * shade);
      }
    }
    context.putImageData(pixels, 0, 0);
    baseCanvasCache.set(image, canvas);
    return canvas;
  }

  function quadSize(quad) {
    const distance = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
    return { width: (distance(quad[0], quad[1]) + distance(quad[3], quad[2])) / 2, height: (distance(quad[0], quad[3]) + distance(quad[1], quad[2])) / 2 };
  }

  function bilinearPoint(quad, u, v) {
    const topX = quad[0][0] + (quad[1][0] - quad[0][0]) * u;
    const topY = quad[0][1] + (quad[1][1] - quad[0][1]) * u;
    const bottomX = quad[3][0] + (quad[2][0] - quad[3][0]) * u;
    const bottomY = quad[3][1] + (quad[2][1] - quad[3][1]) * u;
    return [topX + (bottomX - topX) * v, topY + (bottomY - topY) * v];
  }

  function expandQuad(quad, bleed = 0) {
    if (!bleed) return quad;
    const center = quad.reduce((sum, point) => [sum[0] + point[0] / quad.length, sum[1] + point[1] / quad.length], [0, 0]);
    return quad.map((point) => {
      const dx = point[0] - center[0];
      const dy = point[1] - center[1];
      const length = Math.hypot(dx, dy) || 1;
      return [point[0] + dx / length * bleed, point[1] + dy / length * bleed];
    });
  }

  function drawMappedTriangle(context, image, source, destination) {
    const [s0, s1, s2] = source;
    const [d0, d1, d2] = destination;
    const denominator = s0[0] * (s1[1] - s2[1]) + s1[0] * (s2[1] - s0[1]) + s2[0] * (s0[1] - s1[1]);
    if (Math.abs(denominator) < 0.00001) return;
    const a = (d0[0] * (s1[1] - s2[1]) + d1[0] * (s2[1] - s0[1]) + d2[0] * (s0[1] - s1[1])) / denominator;
    const c = (d0[0] * (s2[0] - s1[0]) + d1[0] * (s0[0] - s2[0]) + d2[0] * (s1[0] - s0[0])) / denominator;
    const e = (d0[0] * (s1[0] * s2[1] - s2[0] * s1[1]) + d1[0] * (s2[0] * s0[1] - s0[0] * s2[1]) + d2[0] * (s0[0] * s1[1] - s1[0] * s0[1])) / denominator;
    const b = (d0[1] * (s1[1] - s2[1]) + d1[1] * (s2[1] - s0[1]) + d2[1] * (s0[1] - s1[1])) / denominator;
    const d = (d0[1] * (s2[0] - s1[0]) + d1[1] * (s0[0] - s2[0]) + d2[1] * (s1[0] - s0[0])) / denominator;
    const f = (d0[1] * (s1[0] * s2[1] - s2[0] * s1[1]) + d1[1] * (s2[0] * s0[1] - s0[0] * s2[1]) + d2[1] * (s0[0] * s1[1] - s1[0] * s0[1])) / denominator;
    context.save();
    context.beginPath();
    context.moveTo(d0[0], d0[1]);
    context.lineTo(d1[0], d1[1]);
    context.lineTo(d2[0], d2[1]);
    context.closePath();
    context.clip();
    context.setTransform(a, b, c, d, e, f);
    context.drawImage(image, 0, 0);
    context.restore();
  }

  function createScreenCanvas(image, targetAspect, fit, adjustments, cornerRadius = 0, transparent = false) {
    const width = 1200;
    const height = Math.max(120, Math.round(width / targetAspect));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    const radius = Math.max(0, Math.min(width, height) * Math.min(0.49, cornerRadius));
    context.save();
    context.beginPath();
    context.roundRect(0, 0, width, height, radius);
    context.clip();
    if (!transparent) {
      context.fillStyle = "#0d0d0d";
      context.fillRect(0, 0, width, height);
    }
    const values = { ...DEFAULT_ADJUSTMENTS, ...(adjustments || {}) };
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    const scaleForFit = fit === "cover" ? Math.max(width / sourceWidth, height / sourceHeight) : Math.min(width / sourceWidth, height / sourceHeight);
    const drawWidth = sourceWidth * scaleForFit;
    const drawHeight = sourceHeight * scaleForFit;
    context.translate(width / 2 + values.offsetX * width * 0.42, height / 2 + values.offsetY * height * 0.42);
    context.rotate(values.rotation * Math.PI / 180);
    context.scale(values.scale, values.scale);
    context.filter = `brightness(${values.brightness}) contrast(${values.contrast}) saturate(${values.saturation})`;
    context.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    context.restore();
    return canvas;
  }

  function drawImageToQuad(context, image, quad, quality = "final") {
    const livePreview = quality === "preview";
    const columns = livePreview ? 8 : 20;
    const rows = livePreview ? 6 : 14;
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const u0 = column / columns;
        const u1 = (column + 1) / columns;
        const v0 = row / rows;
        const v1 = (row + 1) / rows;
        const sx0 = image.width * u0;
        const sx1 = image.width * u1;
        const sy0 = image.height * v0;
        const sy1 = image.height * v1;
        const d00 = bilinearPoint(quad, u0, v0);
        const d10 = bilinearPoint(quad, u1, v0);
        const d11 = bilinearPoint(quad, u1, v1);
        const d01 = bilinearPoint(quad, u0, v1);
        drawMappedTriangle(context, image, [[sx0, sy0], [sx1, sy0], [sx1, sy1]], [d00, d10, d11]);
        drawMappedTriangle(context, image, [[sx0, sy0], [sx1, sy1], [sx0, sy1]], [d00, d11, d01]);
      }
    }
  }

  function fillQuad(context, quad, color) {
    context.save();
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(quad[0][0], quad[0][1]);
    for (let index = 1; index < quad.length; index += 1) context.lineTo(quad[index][0], quad[index][1]);
    context.closePath();
    context.fill();
    context.restore();
  }

  function clipQuad(context, quad) {
    context.beginPath();
    context.moveTo(quad[0][0], quad[0][1]);
    for (let index = 1; index < quad.length; index += 1) context.lineTo(quad[index][0], quad[index][1]);
    context.closePath();
    context.clip();
  }

  function restoreOcclusions(context, baseImage, asset) {
    for (const occlusion of asset.screen.occlusions || []) {
      context.save();
      context.beginPath();
      if (occlusion.type === "circle") context.arc(occlusion.cx, occlusion.cy, occlusion.radius, 0, Math.PI * 2);
      else if (occlusion.type === "rect") context.roundRect(occlusion.x, occlusion.y, occlusion.width, occlusion.height, occlusion.radius || 0);
      else { context.restore(); continue; }
      context.clip();
      if (occlusion.fill) {
        context.fillStyle = occlusion.fill;
        context.fillRect(0, 0, asset.canvas.width, asset.canvas.height);
      } else {
        context.drawImage(baseImage, 0, 0, asset.canvas.width, asset.canvas.height);
      }
      context.restore();
    }
  }

  function renderComposite({ canvas, asset, baseImage, designImage, fit = "cover", adjustments, quad, designQuad, layerImages = {}, quality = "final" }) {
    validateAsset(asset);
    const context = canvas.getContext("2d", { alpha: false });
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
    context.clearRect(0, 0, canvas.width, canvas.height);
    const preparedBase = preparedBaseImage(baseImage, asset);
    context.drawImage(preparedBase, 0, 0, canvas.width, canvas.height);
    const activeQuad = expandQuad(quad || asset.screen.quad, asset.screen.bleed || 0);
    if (designImage) {
      const recommended = asset.screen.recommendedSize;
      const screenCanvas = createScreenCanvas(designImage, recommended.width / recommended.height, fit, adjustments, asset.screen.cornerRadius || 0, true);
      fillQuad(context, activeQuad, asset.screen.underlay || "#080808");
      context.save();
      clipQuad(context, activeQuad);
      drawImageToQuad(context, screenCanvas, designQuad || activeQuad, quality);
      context.restore();
      restoreOcclusions(context, preparedBase, asset);
    }
    if (layerImages.reflection) {
      context.save();
      context.globalAlpha = asset.layers.reflectionOpacity ?? 0.42;
      context.globalCompositeOperation = asset.layers.reflectionBlend || "screen";
      context.drawImage(layerImages.reflection, 0, 0, canvas.width, canvas.height);
      context.restore();
    }
    if (layerImages.foreground) context.drawImage(layerImages.foreground, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  global.MockupRenderer = Object.freeze({ VERSION, DEFAULT_ADJUSTMENTS, validateAsset, quadSize, bilinearPoint, expandQuad, createScreenCanvas, drawImageToQuad, renderComposite });
})(window);
