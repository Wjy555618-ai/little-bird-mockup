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
  const node = figma.currentPage.selection[0];
  if (!node) {
    return { available: false, count: 0, message: "请先在画布中选择一个画框、组件或图片图层" };
  }

  const canExport = typeof node.exportAsync === "function";
  return {
    available: canExport,
    count: figma.currentPage.selection.length,
    id: node.id,
    name: node.name,
    nodeType: node.type,
    width: "width" in node ? node.width : undefined,
    height: "height" in node ? node.height : undefined,
    message: canExport ? `已选择：${node.name}` : "当前图层无法导出为图片"
  };
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
  const node = figma.currentPage.selection[0];
  if (!node || typeof node.exportAsync !== "function") {
    figma.ui.postMessage({ type: "selection-error", message: "请先选择一个可以导出的图层" });
    return;
  }

  try {
    const width = "width" in node ? node.width : 0;
    const exportSettings = width > 2048
      ? { format: "PNG", constraint: { type: "WIDTH", value: 2048 } }
      : { format: "PNG", constraint: { type: "SCALE", value: 1 } };
    const bytes = await node.exportAsync(exportSettings);
    figma.ui.postMessage({
      type: "selection-image",
      bytes,
      name: node.name
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
