(function attachMockupRenderer(global) {
  "use strict";

  const VERSION = "2.4.0";
  const DEFAULT_ADJUSTMENTS = Object.freeze({ scale: 1, offsetX: 0, offsetY: 0, rotation: 0, brightness: 1, contrast: 1, saturation: 1 });
  const DEFAULT_CROP = Object.freeze({ zoom: 1, offsetX: 0, offsetY: 0 });
  const apertureMaskCache = new Map();

  function assertQuad(quad, asset, label) {
    if (!Array.isArray(quad) || quad.length !== 4) throw new Error(`${asset.id} ${label}必须有四个顶点`);
    for (const point of quad) {
      if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)) throw new Error(`${asset.id} ${label}存在无效顶点`);
      if (point[0] < 0 || point[0] > asset.canvas.width || point[1] < 0 || point[1] > asset.canvas.height) throw new Error(`${asset.id} ${label}顶点超出画布`);
    }
  }

  function normalizeCornerRadii(value) {
    const values = Array.isArray(value) ? value : [value ?? 0];
    if (![1, 4].includes(values.length) || values.some((radius) => !Number.isFinite(radius) || radius < 0 || radius > 0.49)) {
      throw new Error("屏幕孔径圆角必须是 0–0.49 之间的一个值或四角数组");
    }
    return values.length === 4 ? [...values] : [values[0], values[0], values[0], values[0]];
  }

  function screenApertureGeometry(asset) {
    const aperture = asset.screen?.aperture;
    return {
      quad: aperture?.quad,
      cornerRadii: normalizeCornerRadii(aperture?.cornerRadii)
    };
  }

  function screenCompositing(asset) {
    const value = asset.screen?.compositing;
    return {
      mode: value?.mode
    };
  }

  function cornerRadiiPixels(value, minimumDimension) {
    return normalizeCornerRadii(value).map((radius) => Math.max(0, minimumDimension * radius));
  }

  function validateAsset(asset) {
    if (!asset || !asset.id || !asset.name) throw new Error("样机缺少 id 或名称");
    if (asset.renderer !== "static-screen-v5") throw new Error(`${asset.id} 渲染器不受支持`);
    if (!Number.isFinite(asset.canvas?.width) || !Number.isFinite(asset.canvas?.height)) throw new Error(`${asset.id} 画布尺寸无效`);
    assertQuad(asset.screen?.quad, asset, "内容映射面");
    if (!asset.screen?.aperture || !Array.isArray(asset.screen.aperture.quad) || !Array.isArray(asset.screen.aperture.cornerRadii)) {
      throw new Error(`${asset.id} 缺少独立的可见孔径几何`);
    }
    const aperture = screenApertureGeometry(asset);
    assertQuad(aperture.quad, asset, "可见孔径");
    if (!asset.layers?.base) throw new Error(`${asset.id} 缺少基础图层`);
    if (!Number.isInteger(asset.screen?.recommendedSize?.width) || !Number.isInteger(asset.screen?.recommendedSize?.height) || asset.screen.recommendedSize.width < 1 || asset.screen.recommendedSize.height < 1) {
      throw new Error(`${asset.id} 缺少有效的推荐画面尺寸`);
    }
    if (!asset.screen.recommendedSize.label) throw new Error(`${asset.id} 缺少推荐画面比例说明`);
    const compositing = screenCompositing(asset);
    if (!asset.screen?.compositing || compositing.mode !== "aperture-mask") throw new Error(`${asset.id} v5 只接收显式孔径遮罩合成`);
    const presentation = asset.screen?.presentation;
    if (!presentation || !["neutral-off", "reference-bound"].includes(presentation.mode)) throw new Error(`${asset.id} 缺少可信屏幕展示来源`);
    if (presentation.mode === "reference-bound" && (!/^[a-f0-9]{64}$/.test(presentation.referenceSha256 || "") || presentation.referenceSha256 !== asset.provenance?.referenceSha256)) {
      throw new Error(`${asset.id} 的屏幕画面没有绑定准确参考图摘要`);
    }
    if (Object.hasOwn(asset, "chromaKey")) throw new Error(`${asset.id} 禁止包含色键配置`);
    if (Object.hasOwn(asset.screen, "underlap") || Object.hasOwn(asset.screen, "bleed") || Object.hasOwn(asset.screen.compositing, "maxEdgeExtension")) {
      throw new Error(`${asset.id} 包含已废弃的色键接缝字段`);
    }
    return asset;
  }

  function screenApertureMask(asset, outputWidth = asset.canvas.width, outputHeight = asset.canvas.height) {
    validateAsset(asset);
    const aperture = screenApertureGeometry(asset);
    const width = Math.max(1, Math.round(outputWidth));
    const height = Math.max(1, Math.round(outputHeight));
    const cacheKey = `${asset.id}:${asset.revision || asset.updatedAt || "current"}:${width}x${height}:${JSON.stringify(aperture)}`;
    if (apertureMaskCache.has(cacheKey)) return apertureMaskCache.get(cacheKey);
    const mask = document.createElement("canvas");
    mask.width = width;
    mask.height = height;
    const maskContext = mask.getContext("2d");
    maskContext.setTransform(width / asset.canvas.width, 0, 0, height / asset.canvas.height, 0, 0);
    maskContext.imageSmoothingEnabled = true;
    maskContext.imageSmoothingQuality = "high";
    const targetAspect = asset.screen.recommendedSize.width / asset.screen.recommendedSize.height;
    const plane = screenPlane(targetAspect);
    const shape = document.createElement("canvas");
    shape.width = plane.width;
    shape.height = plane.height;
    const shapeContext = shape.getContext("2d");
    const radii = cornerRadiiPixels(aperture.cornerRadii, Math.min(plane.width, plane.height));
    shapeContext.fillStyle = "#fff";
    shapeContext.beginPath();
    shapeContext.roundRect(0, 0, plane.width, plane.height, radii);
    shapeContext.fill();
    drawImageToQuad(maskContext, shape, aperture.quad, "final");
    apertureMaskCache.set(cacheKey, mask);
    return mask;
  }

  function screenApertureMetrics(asset) {
    validateAsset(asset);
    const aperture = screenApertureGeometry(asset);
    const area = Math.abs(aperture.quad.reduce((sum, point, index) => {
      const next = aperture.quad[(index + 1) % aperture.quad.length];
      return sum + point[0] * next[1] - next[0] * point[1];
    }, 0) / 2);
    return {
      pass: area >= asset.canvas.width * asset.canvas.height * 0.005,
      mode: "aperture-mask",
      source: "explicit-geometry",
      exact: true,
      apertureArea: area,
      canvasArea: asset.canvas.width * asset.canvas.height
    };
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

  function solveLinearSystem(matrix, values) {
    const size = values.length;
    const rows = matrix.map((row, index) => [...row, values[index]]);
    for (let column = 0; column < size; column += 1) {
      let pivot = column;
      for (let row = column + 1; row < size; row += 1) {
        if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
      }
      if (Math.abs(rows[pivot][column]) < 0.0000001) return null;
      [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
      const divisor = rows[column][column];
      for (let index = column; index <= size; index += 1) rows[column][index] /= divisor;
      for (let row = 0; row < size; row += 1) {
        if (row === column) continue;
        const factor = rows[row][column];
        for (let index = column; index <= size; index += 1) rows[row][index] -= factor * rows[column][index];
      }
    }
    return rows.map((row) => row[size]);
  }

  // Perspective handles edit the visible file boundary, not the hidden full
  // mockup aperture. Recover the aperture quad whose bilinear projection maps
  // the current file frame to the requested four visible points. This keeps
  // normal editing, crop and perspective on one canonical set of file corners.
  function surfaceQuadForFrameQuad(frame, targetAspect, frameQuad) {
    const plane = screenPlane(targetAspect);
    const normalized = normalizeFrame(frame, plane.width, plane.height);
    const basis = frameCorners(normalized).map(([x, y]) => {
      const u = x / plane.width;
      const v = y / plane.height;
      return [(1 - u) * (1 - v), u * (1 - v), u * v, (1 - u) * v];
    });
    const solvedX = solveLinearSystem(basis, frameQuad.map((point) => point[0]));
    const solvedY = solveLinearSystem(basis, frameQuad.map((point) => point[1]));
    if (!solvedX || !solvedY) return null;
    return solvedX.map((x, index) => [x, solvedY[index]]);
  }

  function baselineFrameForAspect(targetAspect) {
    const plane = screenPlane(targetAspect);
    return { cx: plane.width / 2, cy: plane.height / 2, width: plane.width, height: plane.height, rotation: 0 };
  }

  function viewportPointToCanvas(point, rect, logicalSize) {
    return [
      (point[0] - rect.left) / Math.max(1, rect.width) * logicalSize.width,
      (point[1] - rect.top) / Math.max(1, rect.height) * logicalSize.height
    ];
  }

  function logicalPointToBackingStore(point, logicalSize, backingStoreSize) {
    return [
      point[0] * backingStoreSize.width / logicalSize.width,
      point[1] * backingStoreSize.height / logicalSize.height
    ];
  }

  function contentGeometry(image, targetAspect, surfaceQuad, frame, imageFrame) {
    const plane = screenPlane(targetAspect);
    const baselineFrame = baselineFrameForAspect(targetAspect);
    const normalizedFrame = constrainFrameToBounds(
      normalizeFrame(frame, plane.width, plane.height),
      baselineFrame
    );
    const normalizedImageFrame = normalizeFrame(
      imageFrame || imageFrameForCover(image, normalizedFrame),
      plane.width,
      plane.height
    );
    const renderQuad = frameQuadOnSurface(normalizedFrame, targetAspect, surfaceQuad);
    return {
      plane,
      surfaceQuad: surfaceQuad.map((point) => [...point]),
      baselineFrame,
      frame: normalizedFrame,
      imageFrame: normalizedImageFrame,
      renderQuad,
      overlayQuad: renderQuad.map((point) => [...point])
    };
  }

  function planePointToCanvas(point, geometry) {
    return bilinearPoint(
      geometry.surfaceQuad,
      point[0] / geometry.plane.width,
      point[1] / geometry.plane.height
    );
  }

  function canvasPointToPlane(point, geometry) {
    const [u, v] = inverseBilinearPoint(geometry.surfaceQuad, point);
    return [u * geometry.plane.width, v * geometry.plane.height];
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

    // This helper constrains a source rectangle against the target frame it is
    // given. It does not define the plugin's physical aperture or crop model.
    // Work in source-local axes so a rotated or deliberately edge-stretched
    // source still covers every corner of that target.
    const frameAngle = normalizedFrame.rotation * Math.PI / 180;
    const relativeAngle = (normalizedImage.rotation - normalizedFrame.rotation) * Math.PI / 180;
    const cosine = Math.cos(relativeAngle);
    const sine = Math.sin(relativeAngle);
    const requiredWidth = Math.abs(cosine) * normalizedFrame.width + Math.abs(sine) * normalizedFrame.height;
    const requiredHeight = Math.abs(sine) * normalizedFrame.width + Math.abs(cosine) * normalizedFrame.height;
    const preservesSourceAspect = Math.abs(normalizedImage.width / normalizedImage.height / sourceAspect - 1) < 0.001;
    let width;
    let height;
    if (preservesSourceAspect) {
      const scale = Math.max(
        normalizedImage.width / sourceWidth,
        normalizedImage.height / sourceHeight,
        requiredWidth / sourceWidth,
        requiredHeight / sourceHeight
      );
      width = sourceWidth * scale;
      height = sourceHeight * scale;
    } else {
      width = Math.max(normalizedImage.width, requiredWidth);
      height = Math.max(normalizedImage.height, requiredHeight);
    }

    const dx = normalizedImage.cx - normalizedFrame.cx;
    const dy = normalizedImage.cy - normalizedFrame.cy;
    const frameLocalX = dx * Math.cos(frameAngle) + dy * Math.sin(frameAngle);
    const frameLocalY = -dx * Math.sin(frameAngle) + dy * Math.cos(frameAngle);
    const imageLocalX = frameLocalX * cosine + frameLocalY * sine;
    const imageLocalY = -frameLocalX * sine + frameLocalY * cosine;
    const maxX = Math.max(0, (width - requiredWidth) / 2);
    const maxY = Math.max(0, (height - requiredHeight) / 2);
    const clampedImageX = Math.max(-maxX, Math.min(maxX, imageLocalX));
    const clampedImageY = Math.max(-maxY, Math.min(maxY, imageLocalY));
    const clampedFrameX = clampedImageX * cosine - clampedImageY * sine;
    const clampedFrameY = clampedImageX * sine + clampedImageY * cosine;
    return {
      cx: normalizedFrame.cx + clampedFrameX * Math.cos(frameAngle) - clampedFrameY * Math.sin(frameAngle),
      cy: normalizedFrame.cy + clampedFrameX * Math.sin(frameAngle) + clampedFrameY * Math.cos(frameAngle),
      width,
      height,
      rotation: normalizedImage.rotation
    };
  }

  // The visible content frame and the source image transform are deliberately
  // separate. Adjustment controls zoom, pan and rotate the source *inside* the
  // content frame; they must never resize the physical aperture itself.
  function imageFrameFromAdjustments(image, frame, adjustments) {
    const normalizedFrame = normalizeFrame(frame, frame?.width, frame?.height);
    const values = { ...DEFAULT_ADJUSTMENTS, ...(adjustments || {}) };
    const rotation = normalizedFrame.rotation + Math.max(-30, Math.min(30, Number(values.rotation) || 0));
    const cover = imageFrameForCover(image, normalizedFrame);
    const minimum = constrainImageFrameToCover(
      image,
      { ...cover, rotation },
      normalizedFrame
    );
    const scale = Math.max(1, Math.min(4, Number(values.scale) || 1));
    const offsetX = Math.max(-1, Math.min(1, Number(values.offsetX) || 0));
    const offsetY = Math.max(-1, Math.min(1, Number(values.offsetY) || 0));
    return constrainImageFrameToCover(image, {
      cx: normalizedFrame.cx + offsetX * normalizedFrame.width * 0.42,
      cy: normalizedFrame.cy + offsetY * normalizedFrame.height * 0.42,
      width: minimum.width * scale,
      height: minimum.height * scale,
      rotation
    }, normalizedFrame);
  }

  function adjustmentsFromImageFrame(image, imageFrame, frame, adjustments) {
    const normalizedFrame = normalizeFrame(frame, frame?.width, frame?.height);
    const normalizedImage = normalizeFrame(imageFrame, normalizedFrame.width, normalizedFrame.height);
    let rotation = normalizedImage.rotation - normalizedFrame.rotation;
    while (rotation > 180) rotation -= 360;
    while (rotation < -180) rotation += 360;
    rotation = Math.max(-30, Math.min(30, rotation));
    const cover = imageFrameForCover(image, normalizedFrame);
    const minimum = constrainImageFrameToCover(
      image,
      { ...cover, rotation: normalizedFrame.rotation + rotation },
      normalizedFrame
    );
    const scale = Math.max(1, Math.min(4, Math.max(
      normalizedImage.width / minimum.width,
      normalizedImage.height / minimum.height
    )));
    const offsetDenominatorX = normalizedFrame.width * 0.42;
    const offsetDenominatorY = normalizedFrame.height * 0.42;
    return {
      ...DEFAULT_ADJUSTMENTS,
      ...(adjustments || {}),
      scale,
      offsetX: offsetDenominatorX
        ? Math.max(-1, Math.min(1, (normalizedImage.cx - normalizedFrame.cx) / offsetDenominatorX))
        : 0,
      offsetY: offsetDenominatorY
        ? Math.max(-1, Math.min(1, (normalizedImage.cy - normalizedFrame.cy) / offsetDenominatorY))
        : 0,
      rotation
    };
  }

  function pointInFrameAxes(point, frame) {
    const angle = -frame.rotation * Math.PI / 180;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const dx = point[0] - frame.cx;
    const dy = point[1] - frame.cy;
    return [dx * cosine - dy * sine, dx * sine + dy * cosine];
  }

  function pointFromFrameAxes(point, frame) {
    const angle = frame.rotation * Math.PI / 180;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    return [
      frame.cx + point[0] * cosine - point[1] * sine,
      frame.cy + point[0] * sine + point[1] * cosine
    ];
  }

  // The editable/crop frame is a visible region, not the hidden source image.
  // Keep every rotated corner inside the physical screen bounds so the final
  // aperture clip can never make pixels and controls describe different areas.
  function constrainFrameToBounds(frame, bounds) {
    const normalizedFrame = normalizeFrame(frame, bounds.width, bounds.height);
    const normalizedBounds = normalizeFrame(bounds, bounds.width, bounds.height);
    const relativeAngle = (normalizedFrame.rotation - normalizedBounds.rotation) * Math.PI / 180;
    const cosine = Math.abs(Math.cos(relativeAngle));
    const sine = Math.abs(Math.sin(relativeAngle));
    const projectedWidth = cosine * normalizedFrame.width + sine * normalizedFrame.height;
    const projectedHeight = sine * normalizedFrame.width + cosine * normalizedFrame.height;
    const scale = Math.min(
      1,
      normalizedBounds.width / Math.max(1, projectedWidth),
      normalizedBounds.height / Math.max(1, projectedHeight)
    );
    const constrainedFrame = scale < 1
      ? { ...normalizedFrame, width: normalizedFrame.width * scale, height: normalizedFrame.height * scale }
      : normalizedFrame;
    const halfWidth = (cosine * constrainedFrame.width + sine * constrainedFrame.height) / 2;
    const halfHeight = (sine * constrainedFrame.width + cosine * constrainedFrame.height) / 2;
    const local = pointInFrameAxes([normalizedFrame.cx, normalizedFrame.cy], normalizedBounds);
    const minimumX = -normalizedBounds.width / 2 + halfWidth;
    const maximumX = normalizedBounds.width / 2 - halfWidth;
    const minimumY = -normalizedBounds.height / 2 + halfHeight;
    const maximumY = normalizedBounds.height / 2 - halfHeight;
    const center = pointFromFrameAxes([
      Math.max(minimumX, Math.min(maximumX, local[0])),
      Math.max(minimumY, Math.min(maximumY, local[1]))
    ], normalizedBounds);
    return { ...constrainedFrame, cx: center[0], cy: center[1] };
  }

  // Resize from the grabbed edge or corner while the opposite edge remains
  // anchored. Corners preserve the original aspect ratio; side handles resize
  // only one axis, matching Figma's normal selection-box behaviour.
  function resizeFrameFromHandle(frame, handleName, startPointer, pointer, preserveAspect = true) {
    const normalized = normalizeFrame(frame, frame.width, frame.height);
    const start = pointInFrameAxes(startPointer, normalized);
    const next = pointInFrameAxes(pointer, normalized);
    const deltaX = next[0] - start[0];
    const deltaY = next[1] - start[1];
    let left = -normalized.width / 2;
    let right = normalized.width / 2;
    let top = -normalized.height / 2;
    let bottom = normalized.height / 2;
    if (handleName.includes("w")) left += deltaX;
    if (handleName.includes("e")) right += deltaX;
    if (handleName.includes("n")) top += deltaY;
    if (handleName.includes("s")) bottom += deltaY;
    const minimumSize = 20;
    if (right - left < minimumSize) {
      if (handleName.includes("w")) left = right - minimumSize;
      else right = left + minimumSize;
    }
    if (bottom - top < minimumSize) {
      if (handleName.includes("n")) top = bottom - minimumSize;
      else bottom = top + minimumSize;
    }

    const isCorner = handleName.length === 2;
    if (isCorner && preserveAspect) {
      const scaleX = (right - left) / normalized.width;
      const scaleY = (bottom - top) / normalized.height;
      const scale = Math.max(0.05, Math.min(8,
        Math.abs(scaleX - 1) >= Math.abs(scaleY - 1) ? scaleX : scaleY
      ));
      const width = normalized.width * scale;
      const height = normalized.height * scale;
      if (handleName.includes("w")) left = right - width;
      else right = left + width;
      if (handleName.includes("n")) top = bottom - height;
      else bottom = top + height;
    }

    const localCenter = [(left + right) / 2, (top + bottom) / 2];
    const center = pointFromFrameAxes(localCenter, normalized);
    return {
      cx: center[0],
      cy: center[1],
      width: Math.max(minimumSize, right - left),
      height: Math.max(minimumSize, bottom - top),
      rotation: normalized.rotation
    };
  }

  function frameFitsWithinBounds(frame, bounds, tolerance = 0.0001) {
    const normalizedBounds = normalizeFrame(bounds, bounds.width, bounds.height);
    return frameCorners(frame).every((point) => {
      const [x, y] = pointInFrameAxes(point, normalizedBounds);
      return Math.abs(x) <= normalizedBounds.width / 2 + tolerance
        && Math.abs(y) <= normalizedBounds.height / 2 + tolerance;
    });
  }

  // Resize and boundary clamping are one operation. Interpolating the grabbed
  // pointer back to the last valid position preserves the defining invariant:
  // an edge handle changes one axis only, while a corner keeps aspect ratio.
  // A generic "scale the result back into bounds" step is deliberately not
  // used because it changes the untouched axis and makes direct manipulation
  // disagree with the handle the user grabbed.
  function resizeFrameWithinBounds(frame, handleName, startPointer, pointer, bounds, preserveAspect = true) {
    const candidate = resizeFrameFromHandle(frame, handleName, startPointer, pointer, preserveAspect);
    if (frameFitsWithinBounds(candidate, bounds)) return candidate;
    if (!frameFitsWithinBounds(frame, bounds)) throw new Error("缩放起始框必须位于编辑边界内");

    let low = 0;
    let high = 1;
    let result = { ...frame };
    for (let index = 0; index < 32; index += 1) {
      const ratio = (low + high) / 2;
      const interpolatedPointer = [
        startPointer[0] + (pointer[0] - startPointer[0]) * ratio,
        startPointer[1] + (pointer[1] - startPointer[1]) * ratio
      ];
      const next = resizeFrameFromHandle(frame, handleName, startPointer, interpolatedPointer, preserveAspect);
      if (frameFitsWithinBounds(next, bounds)) {
        low = ratio;
        result = next;
      } else {
        high = ratio;
      }
    }
    return result;
  }

  // Apply the exact same local transform to the uploaded content when the
  // ordinary selection box moves or resizes. Crop mode deliberately skips this
  // helper so the crop window can move over a stationary source image.
  function transformFrameBetweenFrames(subject, fromFrame, toFrame) {
    const from = normalizeFrame(fromFrame, fromFrame.width, fromFrame.height);
    const to = normalizeFrame(toFrame, toFrame.width, toFrame.height);
    const local = pointInFrameAxes([subject.cx, subject.cy], from);
    const normalizedX = local[0] / from.width;
    const normalizedY = local[1] / from.height;
    const center = pointFromFrameAxes([normalizedX * to.width, normalizedY * to.height], to);
    return {
      cx: center[0],
      cy: center[1],
      width: Math.max(12, subject.width * to.width / from.width),
      height: Math.max(12, subject.height * to.height / from.height),
      rotation: subject.rotation + to.rotation - from.rotation
    };
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
    // Compose with the caller's backing-store transform. Replacing the
    // transform here silently discarded high-DPI preview scaling and rendered
    // the mapped content into only the top-left fraction of the surface.
    context.transform(a, b, c, d, e, f);
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

  function createScreenCanvas(image, targetAspect, fit, adjustments, cornerRadii = 0, transparent = false, crop, content) {
    const plane = screenPlane(targetAspect);
    const { width, height } = plane;
    if (content?.frame || content?.imageFrame) {
      const frame = normalizeFrame(content.frame, width, height);
      const imageFrame = normalizeFrame(content.imageFrame, width, height);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      const outerRadii = cornerRadiiPixels(cornerRadii, Math.min(width, height));
      context.save();
      context.beginPath();
      context.roundRect(0, 0, width, height, outerRadii);
      context.clip();
      if (!transparent) {
        context.fillStyle = "#0d0d0d";
        context.fillRect(0, 0, width, height);
      }

      context.translate(frame.cx, frame.cy);
      context.rotate(frame.rotation * Math.PI / 180);
      context.beginPath();
      const frameRadii = cornerRadiiPixels(cornerRadii, Math.min(frame.width, frame.height));
      context.roundRect(-frame.width / 2, -frame.height / 2, frame.width, frame.height, frameRadii);
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
    const radii = cornerRadiiPixels(cornerRadii, Math.min(width, height));
    context.save();
    context.beginPath();
    context.roundRect(0, 0, width, height, radii);
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

  function createContentCanvas(image, targetAspect, fit, adjustments, content) {
    const plane = screenPlane(targetAspect);
    const frame = normalizeFrame(content?.frame, plane.width, plane.height);
    const imageFrame = normalizeFrame(content?.imageFrame, plane.width, plane.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(frame.width));
    canvas.height = Math.max(1, Math.round(frame.height));
    const context = canvas.getContext("2d");
    const scaleX = canvas.width / frame.width;
    const scaleY = canvas.height / frame.height;

    // Work only in frame-local coordinates. Both this bitmap and the editor
    // boundary are projected through frameQuadOnSurface, so render, hit target
    // and handles share one canonical geometry path.
    context.scale(scaleX, scaleY);
    context.save();
    context.beginPath();
    context.rect(0, 0, frame.width, frame.height);
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
    const logicalWidth = asset.canvas.width;
    const logicalHeight = asset.canvas.height;
    const renderScaleX = canvas.width / logicalWidth;
    const renderScaleY = canvas.height / logicalHeight;
    const context = canvas.getContext("2d", { alpha: false });
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.setTransform(renderScaleX, 0, 0, renderScaleY, 0, 0);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(baseImage, 0, 0, logicalWidth, logicalHeight);
    if (designImage) {
      const recommended = asset.screen.recommendedSize;
      const targetAspect = recommended.width / recommended.height;
      // Content/editing geometry and the physical aperture are separate. Pixel
      // colors never define either boundary.
      const surfaceQuad = designQuad || quad || asset.screen.quad;
      const aperture = screenApertureGeometry(asset);
      const hasContentGeometry = Boolean(content?.frame || content?.imageFrame);
      const geometry = hasContentGeometry
        ? contentGeometry(designImage, targetAspect, surfaceQuad, content.frame, content.imageFrame)
        : null;
      const contentModel = geometry
        ? { frame: geometry.frame, imageFrame: geometry.imageFrame }
        : null;
      const screenCanvas = hasContentGeometry
        ? createContentCanvas(designImage, targetAspect, fit, adjustments, contentModel)
        : createScreenCanvas(designImage, targetAspect, fit, adjustments, aperture.cornerRadii, true, crop, null);
      // The same projected frame drives pixels, hit testing, selection and crop.
      const renderQuad = geometry?.renderQuad || surfaceQuad;
      const screenLayer = document.createElement("canvas");
      screenLayer.width = canvas.width;
      screenLayer.height = canvas.height;
      const screenContext = screenLayer.getContext("2d");
      screenContext.setTransform(renderScaleX, 0, 0, renderScaleY, 0, 0);
      screenContext.imageSmoothingEnabled = true;
      screenContext.imageSmoothingQuality = "high";
      screenContext.fillStyle = asset.screen.underlay || "#080808";
      screenContext.fillRect(0, 0, logicalWidth, logicalHeight);
      screenContext.save();
      clipQuad(screenContext, renderQuad);
      drawImageToQuad(screenContext, screenCanvas, renderQuad, quality);
      screenContext.restore();
      screenContext.setTransform(1, 0, 0, 1, 0, 0);
      screenContext.globalCompositeOperation = "destination-in";
      screenContext.drawImage(screenApertureMask(asset, canvas.width, canvas.height), 0, 0);
      context.drawImage(screenLayer, 0, 0, logicalWidth, logicalHeight);
      restoreOcclusions(context, baseImage, asset);
    }
    if (layerImages.reflection) {
      context.save();
      context.globalAlpha = asset.layers.reflectionOpacity ?? 0.42;
      context.globalCompositeOperation = asset.layers.reflectionBlend || "screen";
      context.drawImage(layerImages.reflection, 0, 0, logicalWidth, logicalHeight);
      context.restore();
    }
    if (layerImages.foreground) context.drawImage(layerImages.foreground, 0, 0, logicalWidth, logicalHeight);
    return canvas;
  }

  global.MockupRenderer = Object.freeze({ VERSION, DEFAULT_ADJUSTMENTS, DEFAULT_CROP, validateAsset, screenApertureGeometry, screenCompositing, screenApertureMask, screenApertureMetrics, quadSize, bilinearPoint, inverseBilinearPoint, screenPlane, baselineFrameForAspect, normalizeFrame, frameCorners, frameQuadOnSurface, surfaceQuadForFrameQuad, contentGeometry, planePointToCanvas, canvasPointToPlane, viewportPointToCanvas, logicalPointToBackingStore, imageFrameForCover, constrainImageFrameToCover, imageFrameFromAdjustments, adjustmentsFromImageFrame, constrainFrameToBounds, resizeFrameFromHandle, frameFitsWithinBounds, resizeFrameWithinBounds, transformFrameBetweenFrames, cropGeometry, constrainCoverAdjustments, createScreenCanvas, createContentCanvas, drawImageToQuad, renderComposite });
})(window);
