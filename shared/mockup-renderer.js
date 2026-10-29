(function attachMockupRenderer(global) {
  "use strict";

  const VERSION = "2.1.0";
  const DEFAULT_ADJUSTMENTS = Object.freeze({ scale: 1, offsetX: 0, offsetY: 0, rotation: 0, brightness: 1, contrast: 1, saturation: 1 });
  const DEFAULT_CROP = Object.freeze({ zoom: 1, offsetX: 0, offsetY: 0 });
  const baseCanvasCache = new WeakMap();
  const apertureMaskCache = new WeakMap();

  function createDefaultDesign(asset) {
    validateAsset(asset);
    const canvas = document.createElement("canvas");
    canvas.width = asset.screen.recommendedSize.width;
    canvas.height = asset.screen.recommendedSize.height;
    const context = canvas.getContext("2d");
    const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, "#111827");
    gradient.addColorStop(0.48, "#38446f");
    gradient.addColorStop(1, "#8393c7");
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    const size = Math.max(22, Math.round(Math.min(canvas.width, canvas.height) / 12));
    context.strokeStyle = "rgba(255,255,255,.16)";
    context.lineWidth = Math.max(2, size * 0.06);
    for (let x = -canvas.height; x < canvas.width + canvas.height; x += size) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x - canvas.height, canvas.height);
      context.stroke();
    }

    context.fillStyle = "rgba(255,255,255,.92)";
    context.fillRect(canvas.width * 0.09, canvas.height * 0.1, canvas.width * 0.3, Math.max(8, canvas.height * 0.018));
    context.fillStyle = "rgba(255,255,255,.35)";
    context.fillRect(canvas.width * 0.09, canvas.height * 0.145, canvas.width * 0.18, Math.max(5, canvas.height * 0.01));
    return canvas;
  }

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

  function pointInPolygon(x, y, points) {
    let inside = false;
    for (let current = 0, previous = points.length - 1; current < points.length; previous = current, current += 1) {
      const [currentX, currentY] = points[current];
      const [previousX, previousY] = points[previous];
      const crosses = (currentY > y) !== (previousY > y)
        && x < ((previousX - currentX) * (y - currentY)) / (previousY - currentY || Number.EPSILON) + currentX;
      if (crosses) inside = !inside;
    }
    return inside;
  }

  function chromaAlpha(red, green, blue, asset, relaxed = false) {
    if (!asset.chromaKey?.enabled) return 0;
    const configuredMinimum = asset.chromaKey.minimumGreen || 65;
    const configuredDominance = asset.chromaKey.dominance || 1.18;
    const minimumGreen = relaxed ? Math.max(10, configuredMinimum * 0.42) : configuredMinimum;
    const dominance = relaxed ? 1 + (configuredDominance - 1) * 0.28 : configuredDominance;
    if (green < minimumGreen || green <= red * dominance || green <= blue * dominance) return 0;
    if (!relaxed) return 255;
    const margin = Math.min(green - red * dominance, green - blue * dominance);
    return Math.round(Math.max(0, Math.min(1, margin / Math.max(7, configuredMinimum * 0.1))) * 255);
  }

  function apertureAlpha(red, green, blue, asset) {
    const relaxedAlpha = chromaAlpha(red, green, blue, asset, true);
    if (relaxedAlpha) return relaxedAlpha;
    const configuredMinimum = asset.chromaKey?.minimumGreen || 65;
    const configuredDominance = asset.chromaKey?.dominance || 1.18;
    const minimumGreen = Math.max(4, configuredMinimum * 0.08);
    const relaxedMinimum = Math.max(10, configuredMinimum * 0.42);
    const dominance = Math.max(1.01, 1 + (configuredDominance - 1) * 0.06);
    if (green < minimumGreen || green <= red * dominance || green <= blue * dominance) return 0;
    return Math.round(Math.max(0, Math.min(1, (green - minimumGreen) / Math.max(1, relaxedMinimum - minimumGreen))) * 255);
  }

  function screenApertureMask(image, asset) {
    if (!asset.chromaKey?.enabled) return null;
    let imageCache = apertureMaskCache.get(image);
    if (!imageCache) {
      imageCache = new Map();
      apertureMaskCache.set(image, imageCache);
    }
    const cacheKey = `${asset.id}:${asset.revision || asset.updatedAt || "current"}`;
    if (imageCache.has(cacheKey)) return imageCache.get(cacheKey);

    const width = asset.canvas.width;
    const height = asset.canvas.height;
    const source = document.createElement("canvas");
    source.width = width;
    source.height = height;
    const sourceContext = source.getContext("2d", { willReadFrequently: true });
    sourceContext.drawImage(image, 0, 0, width, height);
    const sourcePixels = sourceContext.getImageData(0, 0, width, height);

    const mask = document.createElement("canvas");
    mask.width = width;
    mask.height = height;
    const maskContext = mask.getContext("2d");
    const maskPixels = maskContext.createImageData(width, height);
    const aperturePixels = new Uint8ClampedArray(width * height);
    const supportQuad = expandQuad(asset.screen.quad, Math.max(2, (asset.screen.bleed || 0) + 2));
    const minimumX = Math.max(0, Math.floor(Math.min(...supportQuad.map((point) => point[0]))));
    const maximumX = Math.min(width - 1, Math.ceil(Math.max(...supportQuad.map((point) => point[0]))));
    const minimumY = Math.max(0, Math.floor(Math.min(...supportQuad.map((point) => point[1]))));
    const maximumY = Math.min(height - 1, Math.ceil(Math.max(...supportQuad.map((point) => point[1]))));

    for (let y = minimumY; y <= maximumY; y += 1) {
      const runs = [];
      let runStart = -1;
      for (let x = minimumX; x <= maximumX; x += 1) {
        const pixel = y * width + x;
        let alpha = 0;
        if (pointInPolygon(x + 0.5, y + 0.5, supportQuad)) {
          const index = pixel * 4;
          alpha = apertureAlpha(sourcePixels.data[index], sourcePixels.data[index + 1], sourcePixels.data[index + 2], asset);
          aperturePixels[pixel] = alpha;
        }
        if (alpha && runStart < 0) runStart = x;
        if ((!alpha || x === maximumX) && runStart >= 0) {
          const end = alpha && x === maximumX ? x : x - 1;
          runs.push([runStart, end]);
          runStart = -1;
        }
      }
      if (!runs.length) continue;
      const longest = Math.max(...runs.map(([start, end]) => end - start + 1));
      const minimumRun = Math.max(3, Math.floor(longest * 0.15));
      const screenRuns = runs.filter(([start, end]) => end - start + 1 >= minimumRun);
      if (!screenRuns.length) {
        for (let x = minimumX; x <= maximumX; x += 1) aperturePixels[y * width + x] = 0;
        continue;
      }
      const start = screenRuns[0][0];
      const end = screenRuns.at(-1)[1];
      // The plate may contain camera holes, reflections and compression gaps.
      // Fill only between substantial same-row key runs: the outer silhouette
      // still comes from real pixels, while interior speckles cannot become a
      // black or green seam in the final aperture.
      for (let x = minimumX; x < start; x += 1) aperturePixels[y * width + x] = 0;
      for (let x = start + 1; x < end; x += 1) aperturePixels[y * width + x] = 255;
      for (let x = end + 1; x <= maximumX; x += 1) aperturePixels[y * width + x] = 0;
    }

    const dilatedAperture = aperturePixels.slice();
    for (let y = Math.max(1, minimumY); y <= Math.min(height - 2, maximumY); y += 1) {
      for (let x = Math.max(1, minimumX); x <= Math.min(width - 2, maximumX); x += 1) {
        const pixel = y * width + x;
        if (!aperturePixels[pixel]) continue;
        for (let offsetY = -2; offsetY <= 2; offsetY += 1) {
          for (let offsetX = -2; offsetX <= 2; offsetX += 1) {
            const targetX = x + offsetX;
            const targetY = y + offsetY;
            if (!pointInPolygon(targetX + 0.5, targetY + 0.5, supportQuad)) continue;
            dilatedAperture[targetY * width + targetX] = 255;
          }
        }
      }
    }

    for (let y = minimumY; y <= maximumY; y += 1) {
      for (let x = minimumX; x <= maximumX; x += 1) {
        const pixel = y * width + x;
        const alpha = dilatedAperture[pixel];
        if (!alpha) continue;
        const index = pixel * 4;
        maskPixels.data[index] = 255;
        maskPixels.data[index + 1] = 255;
        maskPixels.data[index + 2] = 255;
        maskPixels.data[index + 3] = alpha;
      }
    }
    maskContext.putImageData(maskPixels, 0, 0);
    imageCache.set(cacheKey, mask);
    return mask;
  }

  function preparedBaseImage(image, asset) {
    if (!asset.chromaKey?.enabled) return image;
    let imageCache = baseCanvasCache.get(image);
    if (!imageCache) {
      imageCache = new Map();
      baseCanvasCache.set(image, imageCache);
    }
    const cacheKey = `${asset.id}:${asset.revision || asset.updatedAt || "current"}`;
    if (imageCache.has(cacheKey)) return imageCache.get(cacheKey);
    const canvas = document.createElement("canvas");
    canvas.width = asset.canvas.width;
    canvas.height = asset.canvas.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const replacement = asset.chromaKey.replacement || [12, 12, 12];
    const supportQuad = expandQuad(asset.screen.quad, Math.max(2, (asset.screen.bleed || 0) + 2));
    const minimumX = Math.floor(Math.min(...supportQuad.map((point) => point[0])));
    const maximumX = Math.ceil(Math.max(...supportQuad.map((point) => point[0])));
    const minimumY = Math.floor(Math.min(...supportQuad.map((point) => point[1])));
    const maximumY = Math.ceil(Math.max(...supportQuad.map((point) => point[1])));
    for (let index = 0; index < pixels.data.length; index += 4) {
      const red = pixels.data[index];
      const green = pixels.data[index + 1];
      const blue = pixels.data[index + 2];
      const pixel = index / 4;
      const x = pixel % canvas.width;
      const y = Math.floor(pixel / canvas.width);
      const insideSupportBounds = x >= minimumX && x <= maximumX && y >= minimumY && y <= maximumY;
      const localRelaxation = insideSupportBounds && pointInPolygon(x + 0.5, y + 0.5, supportQuad);
      const alpha = chromaAlpha(red, green, blue, asset, localRelaxation);
      if (alpha) {
        const shade = Math.max(0.35, Math.min(1, green / 255));
        const mix = alpha / 255;
        pixels.data[index] = Math.round(red * (1 - mix) + replacement[0] * shade * mix);
        pixels.data[index + 1] = Math.round(green * (1 - mix) + replacement[1] * shade * mix);
        pixels.data[index + 2] = Math.round(blue * (1 - mix) + replacement[2] * shade * mix);
      }
    }
    context.putImageData(pixels, 0, 0);
    imageCache.set(cacheKey, canvas);
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

    // The mockup aperture is fixed. Only the source rectangle is transformed.
    // Work in source-local axes so a rotated or deliberately edge-stretched
    // source still covers every corner of the aperture without exposing the
    // base mockup underneath.
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

  // Keep an edited file reachable without snapping it back to the aperture.
  // The old cover constraint made a full-size file mathematically immovable:
  // every drag was immediately clamped to its starting position.
  function constrainFrameVisibility(frame, bounds, minimumVisible = 0.1) {
    const normalizedFrame = normalizeFrame(frame, bounds.width, bounds.height);
    const normalizedBounds = normalizeFrame(bounds, bounds.width, bounds.height);
    const relativeAngle = (normalizedFrame.rotation - normalizedBounds.rotation) * Math.PI / 180;
    const halfWidth = Math.abs(Math.cos(relativeAngle)) * normalizedFrame.width / 2
      + Math.abs(Math.sin(relativeAngle)) * normalizedFrame.height / 2;
    const halfHeight = Math.abs(Math.sin(relativeAngle)) * normalizedFrame.width / 2
      + Math.abs(Math.cos(relativeAngle)) * normalizedFrame.height / 2;
    const requiredX = Math.min(normalizedBounds.width, halfWidth * 2) * Math.max(0, Math.min(1, minimumVisible));
    const requiredY = Math.min(normalizedBounds.height, halfHeight * 2) * Math.max(0, Math.min(1, minimumVisible));
    const local = pointInFrameAxes([normalizedFrame.cx, normalizedFrame.cy], normalizedBounds);
    const minimumX = -normalizedBounds.width / 2 - halfWidth + requiredX;
    const maximumX = normalizedBounds.width / 2 + halfWidth - requiredX;
    const minimumY = -normalizedBounds.height / 2 - halfHeight + requiredY;
    const maximumY = normalizedBounds.height / 2 + halfHeight - requiredY;
    const center = pointFromFrameAxes([
      Math.max(minimumX, Math.min(maximumX, local[0])),
      Math.max(minimumY, Math.min(maximumY, local[1]))
    ], normalizedBounds);
    return { ...normalizedFrame, cx: center[0], cy: center[1] };
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

    // Work only in frame-local coordinates. Both this bitmap and the editor
    // boundary are projected through frameQuadOnSurface, so render, hit target
    // and handles share one canonical geometry path.
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
      const apertureMask = screenApertureMask(baseImage, asset);
      if (apertureMask) {
        const bleedCanvas = hasContentGeometry
          ? createContentCanvas(designImage, targetAspect, fit, adjustments, 0, content)
          : createScreenCanvas(designImage, targetAspect, fit, adjustments, 0, true, crop, null);
        const screenLayer = document.createElement("canvas");
        screenLayer.width = canvas.width;
        screenLayer.height = canvas.height;
        const screenContext = screenLayer.getContext("2d");
        screenContext.fillStyle = asset.screen.underlay || "#080808";
        screenContext.fillRect(0, 0, screenLayer.width, screenLayer.height);
        // Keep the canonical render quad unchanged for editor alignment, then
        // underpaint its outer edge into the asset's declared bleed. This
        // covers the real pixel aperture without moving handles or content.
        const bleedQuad = expandQuad(renderQuad, asset.screen.bleed || 0);
        screenContext.save();
        clipQuad(screenContext, bleedQuad);
        drawImageToQuad(screenContext, bleedCanvas, bleedQuad, quality);
        screenContext.restore();
        screenContext.save();
        clipQuad(screenContext, renderQuad);
        drawImageToQuad(screenContext, screenCanvas, renderQuad, quality);
        screenContext.restore();
        screenContext.globalCompositeOperation = "destination-in";
        screenContext.drawImage(apertureMask, 0, 0);
        context.drawImage(screenLayer, 0, 0);
      } else {
        fillQuad(context, renderQuad, asset.screen.underlay || "#080808");
        context.save();
        clipQuad(context, renderQuad);
        drawImageToQuad(context, screenCanvas, renderQuad, quality);
        context.restore();
      }
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

  global.MockupRenderer = Object.freeze({ VERSION, DEFAULT_ADJUSTMENTS, DEFAULT_CROP, createDefaultDesign, validateAsset, quadSize, bilinearPoint, inverseBilinearPoint, screenPlane, normalizeFrame, frameCorners, frameQuadOnSurface, surfaceQuadForFrameQuad, imageFrameForCover, constrainImageFrameToCover, constrainFrameVisibility, resizeFrameFromHandle, transformFrameBetweenFrames, expandQuad, cropGeometry, constrainCoverAdjustments, createScreenCanvas, createContentCanvas, drawImageToQuad, renderComposite });
})(window);
