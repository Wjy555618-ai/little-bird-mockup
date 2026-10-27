const PLUGIN_VERSION = "0.1.0";
const CATALOG_CACHE_KEY = "mockup-studio-catalog-v1";
const WINDOW_SIZE = {
  expanded: { width: 820, height: 600 },
  collapsed: { width: 320, height: 64 }
};

figma.showUI(__html__, {
  width: WINDOW_SIZE.expanded.width,
  height: WINDOW_SIZE.expanded.height,
  themeColors: true
});

function selectionSummary() {
  const nodes = figma.currentPage.selection.filter((node) => typeof node.exportAsync === "function");
  if (!nodes.length) {
    return { available: false, count: 0, message: "请先在画布中选择一个画框、组件或图片图层" };
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
    figma.ui.postMessage({ type: "selection-error", message: "请先选择一个可以导出的图层" });
    return;
  }

  try {
    const bounds = selectionBounds(nodes);
    const scale = Math.min(1, 2048 / Math.max(bounds.width, bounds.height));
    const layers = await Promise.all(nodes.map(async (node, index) => {
      const box = bounds.boxes[index];
      const bytes = await node.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: scale } });
      return {
        bytes,
        name: node.name,
        nodeType: node.type,
        x: (box.x - bounds.x) * scale,
        y: (box.y - bounds.y) * scale,
        width: box.width * scale,
        height: box.height * scale
      };
    }));
    figma.ui.postMessage({
      type: "selection-composite",
      layers,
      width: Math.max(1, Math.ceil(bounds.width * scale)),
      height: Math.max(1, Math.ceil(bounds.height * scale)),
      name: nodes.length === 1 ? nodes[0].name : `${nodes.length} 个 Figma 图层`,
      sourceType: nodes.length === 1 ? `Figma ${nodes[0].type}` : `Figma 组合 · ${nodes.length} 层`
    });
  } catch (error) {
    figma.ui.postMessage({
      type: "selection-error",
      message: error instanceof Error ? error.message : "读取选区失败"
    });
  }
}

async function pasteRenderedImage(message) {
  try {
    if (!(message.bytes instanceof Uint8Array)) {
      throw new Error("渲染结果格式不正确");
    }

    const image = figma.createImage(message.bytes);
    const maxCanvasWidth = 1200;
    const scale = Math.min(1, maxCanvasWidth / message.width);
    const rectangle = figma.createRectangle();
    rectangle.name = message.name || "样机工作室导出";
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
    figma.ui.postMessage({
      type: "paste-error",
      message: error instanceof Error ? error.message : "粘贴样机失败"
    });
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
      figma.notify(message.message || "样机工作室");
      break;
    case "set-window-state": {
      const next = message.state === "collapsed" ? WINDOW_SIZE.collapsed : WINDOW_SIZE.expanded;
      figma.ui.resize(next.width, next.height);
      figma.ui.postMessage({ type: "window-state-applied", state: message.state });
      break;
    }
    case "resize":
      if (Number.isFinite(message.width) && Number.isFinite(message.height)) {
        figma.ui.resize(
          Math.max(820, Math.min(1180, message.width)),
          Math.max(600, Math.min(820, message.height))
        );
      }
      break;
  }
};

figma.on("selectionchange", publishSelection);
