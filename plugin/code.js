(function attachMockupUserErrors(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MockupUserErrors = api;
})(typeof window !== "undefined" ? window : globalThis, function createMockupUserErrors() {
  const CODES = Object.freeze({
    SELECTION_REQUIRED: "SELECTION_REQUIRED",
    SELECTION_TOO_LARGE: "SELECTION_TOO_LARGE",
    SELECTION_READ_FAILED: "SELECTION_READ_FAILED",
    PASTE_FAILED: "PASTE_FAILED",
    CATALOG_UNAVAILABLE: "CATALOG_UNAVAILABLE",
    ASSET_LOAD_FAILED: "ASSET_LOAD_FAILED",
    FILE_READ_FAILED: "FILE_READ_FAILED",
    EXPORT_FAILED: "EXPORT_FAILED",
    REQUEST_TIMEOUT: "REQUEST_TIMEOUT"
  });

  const MESSAGES = Object.freeze({
    [CODES.SELECTION_REQUIRED]: "请先选择一个可以读取的 Figma 图层",
    [CODES.SELECTION_TOO_LARGE]: "当前选区过大，请减少图层后重试",
    [CODES.SELECTION_READ_FAILED]: "无法读取当前选区，请重新选择后再试",
    [CODES.PASTE_FAILED]: "暂时无法粘贴到画布，请重试",
    [CODES.CATALOG_UNAVAILABLE]: "素材库暂时无法连接，请检查网络后重试",
    [CODES.ASSET_LOAD_FAILED]: "样机素材暂时无法加载，请稍后重试",
    [CODES.FILE_READ_FAILED]: "无法读取这个文件，请更换文件后重试",
    [CODES.EXPORT_FAILED]: "暂时无法导出样机，请重试",
    [CODES.REQUEST_TIMEOUT]: "连接超时，请检查网络后重试"
  });

  const knownCodes = new Set(Object.values(CODES));

  function normalizedCode(code, fallbackCode) {
    if (knownCodes.has(code)) return code;
    if (knownCodes.has(fallbackCode)) return fallbackCode;
    return CODES.EXPORT_FAILED;
  }

  function create(code, userMessage) {
    const resolvedCode = normalizedCode(code);
    const error = new Error(typeof userMessage === "string" && userMessage.trim() ? userMessage : MESSAGES[resolvedCode]);
    error.name = "MockupUserError";
    error.errorCode = resolvedCode;
    error.userSafe = true;
    return error;
  }

  function message(error, fallbackCode) {
    const resolvedCode = normalizedCode(error?.errorCode, fallbackCode);
    if (error?.userSafe === true && typeof error.message === "string" && error.message.trim()) return error.message;
    return MESSAGES[resolvedCode];
  }

  function payload(type, error, fallbackCode) {
    const errorCode = normalizedCode(error?.errorCode, fallbackCode);
    return {
      type,
      errorCode,
      message: message(error, errorCode),
      userSafe: true
    };
  }

  function messageFromPayload(value, fallbackCode) {
    if (!value || value.userSafe !== true || !knownCodes.has(value.errorCode)) return MESSAGES[normalizedCode(fallbackCode)];
    return typeof value.message === "string" && value.message.trim() ? value.message : MESSAGES[value.errorCode];
  }

  function report(context, error, fallbackCode, logger = console.warn) {
    const errorCode = normalizedCode(error?.errorCode, fallbackCode);
    if (typeof logger === "function") logger(`[小鸟样机:${context}] ${errorCode}`, error);
    return MESSAGES[errorCode];
  }

  return Object.freeze({ CODES, MESSAGES, create, message, payload, messageFromPayload, report });
});

const PLUGIN_VERSION = "0.1.2";
const CATALOG_CACHE_KEY = "mockup-studio-catalog-v6";
const MAX_SELECTION_LAYERS = 50;
const MAX_SELECTION_EXPORT_BYTES = 83886080;
const userErrors = globalThis.MockupUserErrors;
const USER_ERROR_CODES = userErrors.CODES;
const WINDOW_SIZE = {
  expanded: { width: 820, height: 600 },
  collapsed: { width: 288, height: 64 }
};
const WINDOW_RESIZE_MOTION_MS = 240;
const WINDOW_RESIZE_FRAME_MS = 16;
let currentWindowSize = { ...WINDOW_SIZE.expanded };
let currentWindowCollapseProgress = 0;
let windowResizeRevision = 0;

figma.showUI(__html__, {
  width: WINDOW_SIZE.expanded.width,
  height: WINDOW_SIZE.expanded.height,
  themeColors: true
});

function easeOutCubic(progress) {
  return 1 - Math.pow(1 - progress, 3);
}

function animateWindowResize(windowState) {
  const targetState = windowState === "collapsed" ? "collapsed" : "expanded";
  const target = WINDOW_SIZE[targetState];
  const targetCollapseProgress = targetState === "collapsed" ? 1 : 0;
  const start = { ...currentWindowSize };
  const startCollapseProgress = currentWindowCollapseProgress;
  const revision = ++windowResizeRevision;
  const startedAt = Date.now();

  if (start.width === target.width && start.height === target.height) {
    currentWindowCollapseProgress = targetCollapseProgress;
    figma.ui.postMessage({ type: "window-state-progress", state: targetState, progress: currentWindowCollapseProgress });
    figma.ui.postMessage({ type: "window-state-applied", state: targetState });
    return;
  }

  function commitFrame() {
    if (revision !== windowResizeRevision) return;
    const progress = Math.min(1, (Date.now() - startedAt) / WINDOW_RESIZE_MOTION_MS);
    const easedProgress = easeOutCubic(progress);
    const width = Math.round(start.width + (target.width - start.width) * easedProgress);
    const height = Math.round(start.height + (target.height - start.height) * easedProgress);
    currentWindowCollapseProgress = startCollapseProgress + (targetCollapseProgress - startCollapseProgress) * easedProgress;
    currentWindowSize = { width, height };
    figma.ui.resize(width, height);
    figma.ui.postMessage({ type: "window-state-progress", state: targetState, progress: currentWindowCollapseProgress });

    if (progress < 1) {
      setTimeout(commitFrame, WINDOW_RESIZE_FRAME_MS);
      return;
    }

    currentWindowSize = { ...target };
    currentWindowCollapseProgress = targetCollapseProgress;
    figma.ui.postMessage({ type: "window-state-applied", state: targetState });
  }

  commitFrame();
}

function selectionSummary() {
  const nodes = figma.currentPage.selection.filter((node) => typeof node.exportAsync === "function");
  if (!nodes.length) {
    return { available: false, count: 0, message: "请先在画布中选择一个画框、组件或图片图层" };
  }
  if (nodes.length > MAX_SELECTION_LAYERS) {
    return { available: false, count: nodes.length, message: `一次最多读取 ${MAX_SELECTION_LAYERS} 个图层，当前选择了 ${nodes.length} 个` };
  }
  const bounds = selectionBounds(nodes);
  const node = nodes[0];
  return {
    available: true,
    count: nodes.length,
    id: node.id,
    name: nodes.length === 1 ? node.name : `${nodes.length} 个图层`,
    nodeType: nodes.length === 1 ? node.type : "MULTI_SELECTION",
    nodeTypes: [...new Set(nodes.map((item) => item.type))],
    width: bounds.width,
    height: bounds.height,
    message: nodes.length === 1 ? `已选择：${node.name}` : `已选择 ${nodes.length} 个图层，将作为一个整体读取`
  };
}

function nodeBounds(node) {
  const bounds = node.absoluteRenderBounds || node.absoluteBoundingBox;
  if (bounds) return bounds;
  return {
    x: "x" in node ? node.x : 0,
    y: "y" in node ? node.y : 0,
    width: "width" in node ? node.width : 1,
    height: "height" in node ? node.height : 1
  };
}

function selectionBounds(nodes) {
  const boxes = nodes.map(nodeBounds);
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top), boxes };
}

function publishSelection() {
  figma.ui.postMessage({
    type: "selection-state",
    selection: selectionSummary(),
    pluginVersion: PLUGIN_VERSION
  });
}

async function publishCatalogCache() {
  const cache = await figma.clientStorage.getAsync(CATALOG_CACHE_KEY);
  figma.ui.postMessage({ type: "catalog-cache", cache: cache || null });
}

async function exportSelection() {
  const nodes = figma.currentPage.selection.filter((node) => typeof node.exportAsync === "function");
  if (!nodes.length) {
    figma.ui.postMessage(userErrors.payload(
      "selection-error",
      userErrors.create(USER_ERROR_CODES.SELECTION_REQUIRED),
      USER_ERROR_CODES.SELECTION_REQUIRED
    ));
    return;
  }
  if (nodes.length > MAX_SELECTION_LAYERS) {
    figma.ui.postMessage(userErrors.payload(
      "selection-error",
      userErrors.create(USER_ERROR_CODES.SELECTION_TOO_LARGE, `一次最多读取 ${MAX_SELECTION_LAYERS} 个图层，当前选择了 ${nodes.length} 个`),
      USER_ERROR_CODES.SELECTION_TOO_LARGE
    ));
    return;
  }

  try {
    const bounds = selectionBounds(nodes);
    const scale = Math.min(1, 2048 / Math.max(bounds.width, bounds.height));
    const layers = [];
    let totalBytes = 0;
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      const box = bounds.boxes[index];
      const bytes = await node.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: scale } });
      if (!(bytes instanceof Uint8Array)) throw userErrors.create(USER_ERROR_CODES.SELECTION_READ_FAILED);
      totalBytes += bytes.byteLength;
      if (totalBytes > MAX_SELECTION_EXPORT_BYTES) {
        throw userErrors.create(
          USER_ERROR_CODES.SELECTION_TOO_LARGE,
          `Figma 选区导出超过 ${Math.floor(MAX_SELECTION_EXPORT_BYTES / (1024 * 1024))} MB，请减少图层或拆分读取`
        );
      }
      layers.push({
        bytes,
        name: node.name,
        nodeType: node.type,
        x: (box.x - bounds.x) * scale,
        y: (box.y - bounds.y) * scale,
        width: box.width * scale,
        height: box.height * scale
      });
    }
    figma.ui.postMessage({
      type: "selection-composite",
      layers,
      width: Math.max(1, Math.ceil(bounds.width * scale)),
      height: Math.max(1, Math.ceil(bounds.height * scale)),
      name: nodes.length === 1 ? nodes[0].name : `${nodes.length} 个 Figma 图层`,
      sourceType: nodes.length === 1 ? `Figma ${nodes[0].type}` : `Figma 组合 · ${nodes.length} 层`
    });
  } catch (error) {
    userErrors.report("selection-export", error, USER_ERROR_CODES.SELECTION_READ_FAILED);
    figma.ui.postMessage(userErrors.payload("selection-error", error, USER_ERROR_CODES.SELECTION_READ_FAILED));
  }
}

async function pasteRenderedImage(message) {
  try {
    if (!(message.bytes instanceof Uint8Array)) {
      throw userErrors.create(USER_ERROR_CODES.PASTE_FAILED);
    }

    const image = figma.createImage(message.bytes);
    const maxCanvasWidth = 1200;
    const scale = Math.min(1, maxCanvasWidth / message.width);
    const rectangle = figma.createRectangle();
    rectangle.name = message.name || "小鸟样机导出";
    rectangle.resize(message.width * scale, message.height * scale);
    rectangle.fills = [{
      type: "IMAGE",
      scaleMode: "FILL",
      imageHash: image.hash
    }];
    rectangle.x = figma.viewport.center.x - rectangle.width / 2;
    rectangle.y = figma.viewport.center.y - rectangle.height / 2;
    figma.currentPage.appendChild(rectangle);
    figma.currentPage.selection = [rectangle];
    figma.viewport.scrollAndZoomIntoView([rectangle]);
    figma.notify("样机已粘贴到画布");
    figma.ui.postMessage({ type: "paste-complete", nodeId: rectangle.id });
  } catch (error) {
    userErrors.report("paste-render", error, USER_ERROR_CODES.PASTE_FAILED);
    figma.ui.postMessage(userErrors.payload("paste-error", error, USER_ERROR_CODES.PASTE_FAILED));
  }
}

figma.ui.onmessage = async (message) => {
  if (!message || typeof message.type !== "string") return;

  switch (message.type) {
    case "ready":
      publishSelection();
      await publishCatalogCache();
      break;
    case "cache-catalog":
      await figma.clientStorage.setAsync(CATALOG_CACHE_KEY, message.cache);
      figma.ui.postMessage({ type: "catalog-cache-saved" });
      break;
    case "request-selection":
      await exportSelection();
      break;
    case "paste-render":
      await pasteRenderedImage(message);
      break;
    case "notify":
      figma.notify(message.message || "小鸟样机");
      break;
    case "set-window-state": {
      animateWindowResize(message.state);
      break;
    }
    case "resize":
      if (Number.isFinite(message.width) && Number.isFinite(message.height)) {
        windowResizeRevision += 1;
        currentWindowCollapseProgress = 0;
        currentWindowSize = {
          width: Math.max(820, Math.min(1180, message.width)),
          height: Math.max(600, Math.min(820, message.height))
        };
        figma.ui.resize(currentWindowSize.width, currentWindowSize.height);
      }
      break;
  }
};

figma.on("selectionchange", publishSelection);
