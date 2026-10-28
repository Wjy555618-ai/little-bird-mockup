(function attachMockupRenderer(global) {
  "use strict";

  const VERSION = "2.1.0";
  const DEFAULT_ADJUSTMENTS = Object.freeze({ scale: 1, offsetX: 0, offsetY: 0, rotation: 0, brightness: 1, contrast: 1, saturation: 1 });
  const DEFAULT_CROP = Object.freeze({ zoom: 1, offsetX: 0, offsetY: 0 });
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

  function inverseBilinearPoint(quad, point) {
    let u = 0.5;
    let v = 0.5;
    for (let iteration = 0; iteration < 12; iteration += 1) {
      const current = bilinearPoint(quad, u, v);
      const errorX = current[0] - point[0];
      const errorY = current[1] - point[1];
      if (Math.hypot(errorX, errorY) < 0.001) break;
      const epsilon = 0.0001;
      const alongU = bilinearPoint(quad, u + epsilon, v);
      const alongV = bilinearPoint(quad, u, v + epsilon);
      const ux = (alongU[0] - current[0]) / epsilon;
      const uy = (alongU[1] - current[1]) / epsilon;
      const vx = (alongV[0] - current[0]) / epsilon;
      const vy = (alongV[1] - current[1]) / epsilon;
      const determinant = ux * vy - uy * vx;
      if (Math.abs(determinant) < 0.000001) break;
      u -= (errorX * vy - errorY * vx) / determinant;
      v -= (ux * errorY - uy * errorX) / determinant;
    }
    return [u, v];
  }

  function screenPlane(targetAspect) {
    const width = 1200;
    return { width, height: Math.max(120, Math.round(width / targetAspect)) };
  }

  function normalizeFrame(frame, width, height) {
    return {
      cx: Number.isFinite(frame?.cx) ? frame.cx : width / 2,
      cy: Number.isFinite(frame?.cy) ? frame.cy : height / 2,
      width: Math.max(12, Number.isFinite(frame?.width) ? frame.width : width),
      height: Math.max(12, Number.isFinite(frame?.height) ? frame.height : height),
      rotation: Number.isFinite(frame?.rotation) ? frame.rotation : 0
    };
  }

  function frameCorners(frame) {
    const angle = frame.rotation * Math.PI / 180;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const local = [
      [-frame.width / 2, -frame.height / 2],
      [frame.width / 2, -frame.height / 2],
      [frame.width / 2, frame.height / 2],
      [-frame.width / 2, frame.height / 2]
    ];
    return local.map(([x, y]) => [frame.cx + x * cosine - y * sine, frame.cy + x * sine + y * cosine]);
  }

  function frameQuadOnSurface(frame, targetAspect, surfaceQuad) {
    const plane = screenPlane(targetAspect);
    const normalized = normalizeFrame(frame, plane.width, plane.height);
    return frameCorners(normalized).map((point) => bilinearPoint(
      surfaceQuad,
      point[0] / plane.width,
      point[1] / plane.height
    ));
  }

  function imageFrameForCover(image, frame) {
    const sourceWidth = Math.max(1, image?.naturalWidth || image?.width || 1);
    const sourceHeight = Math.max(1, image?.naturalHeight || image?.height || 1);
    const scale = Math.max(frame.width / sourceWidth, frame.height / sourceHeight);
    return {
      cx: frame.cx,
      cy: frame.cy,
      width: sourceWidth * scale,
      height: sourceHeight * scale,
      rotation: frame.rotation
    };
  }

  function constrainImageFrameToCover(image, imageFrame, frame) {
    const sourceWidth = Math.max(1, image?.naturalWidth || image?.width || 1);
    const sourceHeight = Math.max(1, image?.naturalHeight || image?.height || 1);
    const sourceAspect = sourceWidth / sourceHeight;
    const normalizedFrame = normalizeFrame(frame, frame.width, frame.height);
    const normalizedImage = normalizeFrame(imageFrame, normalizedFrame.width, normalizedFrame.height);

    // imageFrame is the actual source-image rectangle. Preserve its source
    // aspect, enlarge it only when needed, then keep it covering the visible
    // content frame so the editor can never expose an unrelated underlay.
    let width = Math.max(normalizedImage.width, normalizedImage.height * sourceAspect);
    let height = width / sourceAspect;
    if (height < normalizedImage.height) {
      height = normalizedImage.height;
      width = height * sourceAspect;
    }
    const coverScale = Math.max(1, normalizedFrame.width / width, normalizedFrame.height / height);
    width *= coverScale;
    height *= coverScale;

    const angle = normalizedFrame.rotation * Math.PI / 180;
    const dx = normalizedImage.cx - normalizedFrame.cx;
    const dy = normalizedImage.cy - normalizedFrame.cy;
    const localX = dx * Math.cos(angle) + dy * Math.sin(angle);
    const localY = -dx * Math.sin(angle) + dy * Math.cos(angle);
    const maxX = Math.max(0, (width - normalizedFrame.width) / 2);
    const maxY = Math.max(0, (height - normalizedFrame.height) / 2);
    const clampedX = Math.max(-maxX, Math.min(maxX, localX));
    const clampedY = Math.max(-maxY, Math.min(maxY, localY));
    return {
      cx: normalizedFrame.cx + clampedX * Math.cos(angle) - clampedY * Math.sin(angle),
      cy: normalizedFrame.cy + clampedX * Math.sin(angle) + clampedY * Math.cos(angle),
      width,
      height,
      rotation: normalizedFrame.rotation
    };
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

  function cropGeometry(image, targetAspect, crop) {
    const width = 1200;
    const height = Math.max(120, Math.round(width / targetAspect));
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    const baseScale = Math.max(width / sourceWidth, height / sourceHeight);
    const values = { ...DEFAULT_CROP, ...(crop || {}) };
    const zoom = Math.max(1, Math.min(8, Number(values.zoom) || 1));
    const drawWidth = sourceWidth * baseScale * zoom;
    const drawHeight = sourceHeight * baseScale * zoom;
    const maxOffsetX = Math.max(0, (drawWidth - width) / 2);
    const maxOffsetY = Math.max(0, (drawHeight - height) / 2);
    const desiredX = Math.max(-1, Math.min(1, Number(values.offsetX) || 0)) * width * 0.42;
    const desiredY = Math.max(-1, Math.min(1, Number(values.offsetY) || 0)) * height * 0.42;
    const offsetPixelsX = Math.max(-maxOffsetX, Math.min(maxOffsetX, desiredX));
    const offsetPixelsY = Math.max(-maxOffsetY, Math.min(maxOffsetY, desiredY));
    return {
      width,
      height,
      drawWidth,
      drawHeight,
      offsetPixelsX,
      offsetPixelsY,
      crop: {
        zoom,
        offsetX: width ? offsetPixelsX / (width * 0.42) : 0,
        offsetY: height ? offsetPixelsY / (height * 0.42) : 0
      }
    };
  }

  function constrainCoverAdjustments(adjustments, width, height) {
    const values = { ...DEFAULT_ADJUSTMENTS, ...(adjustments || {}) };
    const angle = (Number(values.rotation) || 0) * Math.PI / 180;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const requiredHalfWidth = (Math.abs(cosine) * width + Math.abs(sine) * height) / 2;
    const requiredHalfHeight = (Math.abs(sine) * width + Math.abs(cosine) * height) / 2;
    const minimumScale = Math.max(1, requiredHalfWidth * 2 / width, requiredHalfHeight * 2 / height);
    const scale = Math.max(minimumScale, Math.min(4, Number(values.scale) || 1));
    const desiredWorldX = Math.max(-1, Math.min(1, Number(values.offsetX) || 0)) * width * 0.42;
    const desiredWorldY = Math.max(-1, Math.min(1, Number(values.offsetY) || 0)) * height * 0.42;
    const desiredLocalX = desiredWorldX * cosine + desiredWorldY * sine;
    const desiredLocalY = -desiredWorldX * sine + desiredWorldY * cosine;
    const maxLocalX = Math.max(0, width * scale / 2 - requiredHalfWidth);
    const maxLocalY = Math.max(0, height * scale / 2 - requiredHalfHeight);
    const localX = Math.max(-maxLocalX, Math.min(maxLocalX, desiredLocalX));
    const localY = Math.max(-maxLocalY, Math.min(maxLocalY, desiredLocalY));
    const worldX = localX * cosine - localY * sine;
    const worldY = localX * sine + localY * cosine;
    return {
      ...values,
      scale,
      offsetX: width ? worldX / (width * 0.42) : 0,
      offsetY: height ? worldY / (height * 0.42) : 0
    };
  }

  function createScreenCanvas(image, targetAspect, fit, adjustments, cornerRadius = 0, transparent = false, crop, content) {
    const plane = screenPlane(targetAspect);
    const { width, height } = plane;
    if (content?.frame || content?.imageFrame) {
      const frame = normalizeFrame(content.frame, width, height);
      const imageFrame = normalizeFrame(content.imageFrame, width, height);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      const outerRadius = Math.max(0, Math.min(width, height) * Math.min(0.49, cornerRadius));
      context.save();
      context.beginPath();
      context.roundRect(0, 0, width, height, outerRadius);
      context.clip();
      if (!transparent) {
        context.fillStyle = "#0d0d0d";
        context.fillRect(0, 0, width, height);
      }

      context.translate(frame.cx, frame.cy);
      context.rotate(frame.rotation * Math.PI / 180);
      context.beginPath();
      const frameRadius = Math.max(0, Math.min(frame.width, frame.height) * Math.min(0.49, cornerRadius));
      context.roundRect(-frame.width / 2, -frame.height / 2, frame.width, frame.height, frameRadius);
      context.clip();
      context.rotate(-frame.rotation * Math.PI / 180);
      context.translate(-frame.cx, -frame.cy);

      const sourceWidth = image.naturalWidth || image.width;
      const sourceHeight = image.naturalHeight || image.height;
      const imageScale = fit === "contain"
        ? Math.min(imageFrame.width / sourceWidth, imageFrame.height / sourceHeight)
        : Math.max(imageFrame.width / sourceWidth, imageFrame.height / sourceHeight);
      const drawWidth = sourceWidth * imageScale;
      const drawHeight = sourceHeight * imageScale;
      const values = { ...DEFAULT_ADJUSTMENTS, ...(adjustments || {}) };
      context.translate(imageFrame.cx, imageFrame.cy);
      context.rotate(imageFrame.rotation * Math.PI / 180);
      context.filter = `brightness(${values.brightness}) contrast(${values.contrast}) saturate(${values.saturation})`;
      context.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
      context.restore();
      return canvas;
    }

    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = width;
    cropCanvas.height = height;
    const cropContext = cropCanvas.getContext("2d");
    const geometry = cropGeometry(image, targetAspect, crop);
    cropContext.drawImage(
      image,
      width / 2 + geometry.offsetPixelsX - geometry.drawWidth / 2,
      height / 2 + geometry.offsetPixelsY - geometry.drawHeight / 2,
      geometry.drawWidth,
      geometry.drawHeight
    );

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
    const values = constrainCoverAdjustments(adjustments, width, height);
    context.translate(width / 2 + values.offsetX * width * 0.42, height / 2 + values.offsetY * height * 0.42);
    context.rotate(values.rotation * Math.PI / 180);
    context.scale(values.scale, values.scale);
    context.filter = `brightness(${values.brightness}) contrast(${values.contrast}) saturate(${values.saturation})`;
    context.drawImage(cropCanvas, -width / 2, -height / 2, width, height);
    context.restore();
    return canvas;
  }

  function createContentCanvas(image, targetAspect, fit, adjustments, cornerRadius = 0, content) {
    const plane = screenPlane(targetAspect);
    const frame = normalizeFrame(content?.frame, plane.width, plane.height);
    const imageFrame = normalizeFrame(content?.imageFrame, plane.width, plane.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(frame.width));
    canvas.height = Math.max(1, Math.round(frame.height));
    const context = canvas.getContext("2d");
    const scaleX = canvas.width / frame.width;
    const scaleY = canvas.height / frame.height;
    const radius = Math.max(0, Math.min(frame.width, frame.height) * Math.min(0.49, cornerRadius));

    // Work only in frame-local coordinates. The resulting bitmap is mapped
    // directly to the exact same four points used by the editor handles.
    // This removes the former second transform through the full screen plane.
    context.scale(scaleX, scaleY);
    context.save();
    context.beginPath();
    context.roundRect(0, 0, frame.width, frame.height, radius);
    context.clip();

    const frameAngle = frame.rotation * Math.PI / 180;
    const dx = imageFrame.cx - frame.cx;
    const dy = imageFrame.cy - frame.cy;
    const localX = dx * Math.cos(frameAngle) + dy * Math.sin(frameAngle);
    const localY = -dx * Math.sin(frameAngle) + dy * Math.cos(frameAngle);
    const values = { ...DEFAULT_ADJUSTMENTS, ...(adjustments || {}) };
    context.translate(frame.width / 2 + localX, frame.height / 2 + localY);
    context.rotate((imageFrame.rotation - frame.rotation) * Math.PI / 180);
    context.filter = `brightness(${values.brightness}) contrast(${values.contrast}) saturate(${values.saturation})`;
    context.drawImage(image, -imageFrame.width / 2, -imageFrame.height / 2, imageFrame.width, imageFrame.height);
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

  function renderComposite({ canvas, asset, baseImage, designImage, fit = "cover", adjustments, crop, content, quad, designQuad, layerImages = {}, quality = "final" }) {
    validateAsset(asset);
    const context = canvas.getContext("2d", { alpha: false });
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
    context.clearRect(0, 0, canvas.width, canvas.height);
    const preparedBase = preparedBaseImage(baseImage, asset);
    context.drawImage(preparedBase, 0, 0, canvas.width, canvas.height);
    const screenMaskQuad = expandQuad(quad || asset.screen.quad, asset.screen.bleed || 0);
    if (designImage) {
      const recommended = asset.screen.recommendedSize;
      const targetAspect = recommended.width / recommended.height;
      const surfaceQuad = designQuad || screenMaskQuad;
      const hasContentGeometry = Boolean(content?.frame || content?.imageFrame);
      const screenCanvas = hasContentGeometry
        ? createContentCanvas(designImage, targetAspect, fit, adjustments, asset.screen.cornerRadius || 0, content)
        : createScreenCanvas(designImage, targetAspect, fit, adjustments, asset.screen.cornerRadius || 0, true, crop, null);
      // Rendering and editing deliberately derive from one frame quad. Mapping
      // the whole transparent screen plane here used to apply geometry twice,
      // which made pixels drift away from their handles after crop or zoom.
      const renderQuad = hasContentGeometry
        ? frameQuadOnSurface(content.frame, targetAspect, surfaceQuad)
        : surfaceQuad;
      fillQuad(context, renderQuad, asset.screen.underlay || "#080808");
      context.save();
      clipQuad(context, renderQuad);
      drawImageToQuad(context, screenCanvas, renderQuad, quality);
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

  global.MockupRenderer = Object.freeze({ VERSION, DEFAULT_ADJUSTMENTS, DEFAULT_CROP, validateAsset, quadSize, bilinearPoint, inverseBilinearPoint, screenPlane, normalizeFrame, frameCorners, frameQuadOnSurface, imageFrameForCover, constrainImageFrameToCover, expandQuad, cropGeometry, constrainCoverAdjustments, createScreenCanvas, createContentCanvas, drawImageToQuad, renderComposite });
})(window);
