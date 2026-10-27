const PLUGIN_VERSION = "0.1.0";
const DEVELOPMENT_CATALOG_URL = "http://localhost:4173/catalog/testing/v1/manifest.json";
const PRODUCTION_CATALOG_URL = "https://assets.mockup-studio.example/v1/manifest.json";
const ACTIVE_CATALOG_URL = DEVELOPMENT_CATALOG_URL;
const renderer = window.MockupRenderer;
const CATALOG_CACHE_KEY = "mockup-studio-catalog-v1";
const RECENT_KEY = "mockup-studio-recent-v1";
const memoryStorage = new Map();

const safeStorage = {
  getItem(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return memoryStorage.get(key) || null;
    }
  },
  setItem(key, value) {
    memoryStorage.set(key, value);
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Figma plugin UIs run inside a data: URL where localStorage is disabled.
    }
  },
  removeItem(key) {
    memoryStorage.delete(key);
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Keep the in-memory fallback only.
    }
  }
};

const elements = {
  versionLabel: document.querySelector("#versionLabel"),
  catalogState: document.querySelector("#catalogState"),
  refreshButton: document.querySelector("#refreshButton"),
  searchInput: document.querySelector("#searchInput"),
  clearSearch: document.querySelector("#clearSearch"),
  categorySelect: document.querySelector("#categorySelect"),
  catalogCount: document.querySelector("#catalogCount"),
  catalogView: document.querySelector("#catalogView"),
  adjustPanel: document.querySelector("#adjustPanel"),
  adjustPanelTitle: document.querySelector("#adjustPanelTitle"),
  assetGrid: document.querySelector("#assetGrid"),
  catalogEmpty: document.querySelector("#catalogEmpty"),
  selectionChip: document.querySelector("#selectionChip"),
  selectionText: document.querySelector("#selectionText"),
  readSelectionButton: document.querySelector("#readSelectionButton"),
  imageInput: document.querySelector("#imageInput"),
  clearDesignButton: document.querySelector("#clearDesignButton"),
  designSourceLabel: document.querySelector("#designSourceLabel"),
  fitMode: document.querySelector("#fitMode"),
  designScale: document.querySelector("#designScale"),
  designScaleValue: document.querySelector("#designScaleValue"),
  designOffsetX: document.querySelector("#designOffsetX"),
  designOffsetXValue: document.querySelector("#designOffsetXValue"),
  designOffsetY: document.querySelector("#designOffsetY"),
  designOffsetYValue: document.querySelector("#designOffsetYValue"),
  designRotation: document.querySelector("#designRotation"),
  designRotationValue: document.querySelector("#designRotationValue"),
  designBrightness: document.querySelector("#designBrightness"),
  designBrightnessValue: document.querySelector("#designBrightnessValue"),
  designContrast: document.querySelector("#designContrast"),
  designContrastValue: document.querySelector("#designContrastValue"),
  designSaturation: document.querySelector("#designSaturation"),
  designSaturationValue: document.querySelector("#designSaturationValue"),
  resetAdjustmentsButton: document.querySelector("#resetAdjustmentsButton"),
  resetPerspectiveButton: document.querySelector("#resetPerspectiveButton"),
  backgroundToggle: document.querySelector("#backgroundToggle"),
  stage: document.querySelector("#stage"),
  canvasWrap: document.querySelector("#canvasWrap"),
  previewCanvas: document.querySelector("#previewCanvas"),
  screenCta: document.querySelector("#screenCta"),
  renderingBadge: document.querySelector("#renderingBadge"),
  assetName: document.querySelector("#assetName"),
  assetMeta: document.querySelector("#assetMeta"),
  downloadButton: document.querySelector("#downloadButton"),
  pasteButton: document.querySelector("#pasteButton"),
  zoomOut: document.querySelector("#zoomOut"),
  zoomIn: document.querySelector("#zoomIn"),
  zoomReset: document.querySelector("#zoomReset"),
  stageTitle: document.querySelector("#stageTitle"),
  perspectiveEditor: document.querySelector("#perspectiveEditor"),
  perspectivePolygon: document.querySelector("#perspectivePolygon"),
  recentStrip: document.querySelector("#recentStrip"),
  recentItems: document.querySelector("#recentItems"),
  clearRecent: document.querySelector("#clearRecent"),
  collapseButton: document.querySelector("#collapseButton"),
  expandButton: document.querySelector("#expandButton"),
  collapsedBar: document.querySelector("#collapsedBar"),
  resizeGrip: document.querySelector("#resizeGrip"),
  toast: document.querySelector("#toast")
};

const DEFAULT_ADJUSTMENTS = renderer.DEFAULT_ADJUSTMENTS;

const state = {
  manifest: null,
  catalogBaseUrl: ACTIVE_CATALOG_URL,
  catalogMode: "loading",
  selectedAsset: null,
  baseImage: null,
  layerImages: {},
  designImage: null,
  designObjectUrl: null,
  selection: null,
  segment: "all",
  mode: "catalog",
  zoom: 1,
  rendering: false,
  pluginCatalogCache: null,
  customQuad: null,
  designName: "",
  adjustments: { ...DEFAULT_ADJUSTMENTS }
};

elements.versionLabel.textContent = `v${PLUGIN_VERSION}`;

function postPluginMessage(message) {
  if (window.parent === window) {
    handlePreviewBridge(message);
    return;
  }
  parent.postMessage({ pluginMessage: message }, "*");
}

function dispatchPreviewMessage(pluginMessage) {
  window.dispatchEvent(new MessageEvent("message", { data: { pluginMessage } }));
}

async function previewDesignBytes() {
  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height = 1000;
  const context = canvas.getContext("2d");
  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "#101827");
  gradient.addColorStop(0.55, "#254d77");
  gradient.addColorStop(1, "#6d94bd");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#ffffff0c";
  for (let x = 70; x < canvas.width; x += 150) {
    for (let y = 70; y < canvas.height; y += 150) {
      context.beginPath();
      context.roundRect(x, y, 116, 116, 22);
      context.fill();
    }
  }
  context.fillStyle = "#f2f2f2";
  context.fillRect(80, 790, 310, 12);
  context.fillStyle = "white";
  context.font = "600 68px Inter, sans-serif";
  context.fillText("Selected design", 80, 900);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  return new Uint8Array(await blob.arrayBuffer());
}

function handlePreviewBridge(message) {
  if (message.type === "ready") {
    setTimeout(() => dispatchPreviewMessage({
      type: "selection-state",
      pluginVersion: PLUGIN_VERSION,
      selection: {
        available: true,
        count: 1,
        name: "首页设计稿",
        nodeType: "FRAME",
        width: 1600,
        height: 1000,
        message: "已选择：首页设计稿（预览模拟）"
      }
    }), 30);
  }
  if (message.type === "request-selection") {
    previewDesignBytes().then((bytes) => dispatchPreviewMessage({
      type: "selection-image",
      bytes,
      name: "首页设计稿（预览模拟）"
    }));
  }
  if (message.type === "paste-render") {
    setTimeout(() => dispatchPreviewMessage({ type: "paste-complete", nodeId: "preview-node" }), 80);
  }
}

function setCatalogState(mode, label) {
  state.catalogMode = mode;
  elements.catalogState.className = `catalog-state ${mode}`;
  elements.catalogState.textContent = label;
  elements.catalogState.title = label;
  elements.catalogState.setAttribute("aria-label", label);
}

let toastTimer;
function showToast(message, duration = 2600) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  toastTimer = setTimeout(() => { elements.toast.hidden = true; }, duration);
}

function withTimeout(promise, milliseconds) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("请求超时")), milliseconds))
  ]);
}

function validateManifest(manifest) {
  if (!manifest || ![1, 2].includes(manifest.schemaVersion)) throw new Error("不支持的素材清单版本");
  if (!Array.isArray(manifest.items)) throw new Error("素材清单缺少 items");
  for (const item of manifest.items) {
    renderer.validateAsset(item);
    if (!item.thumbnail) throw new Error(`样机缩略图路径无效：${item.id}`);
  }
  return manifest;
}

function resolveAssetUrl(relativePath) {
  return new URL(relativePath, state.catalogBaseUrl).href;
}

async function fetchCatalog() {
  setCatalogState("loading", "连接素材库");
  try {
    const response = await withTimeout(fetch(ACTIVE_CATALOG_URL, { cache: "no-store" }), 4500);
    if (!response.ok) throw new Error(`素材库返回 ${response.status}`);
    const manifest = validateManifest(await response.json());
    state.manifest = manifest;
    state.catalogBaseUrl = ACTIVE_CATALOG_URL;
    const cache = {
      manifest,
      catalogBaseUrl: state.catalogBaseUrl,
      cachedAt: new Date().toISOString()
    };
    safeStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(cache));
    postPluginMessage({ type: "cache-catalog", cache });
    setCatalogState("online", "素材库已同步");
    hydrateCatalog();
    return;
  } catch (error) {
    const cached = state.pluginCatalogCache || safeStorage.getItem(CATALOG_CACHE_KEY);
    if (cached) {
      try {
        const value = typeof cached === "string" ? JSON.parse(cached) : cached;
        state.manifest = validateManifest(value.manifest);
        state.catalogBaseUrl = value.catalogBaseUrl;
        setCatalogState("cached", "使用离线目录");
        hydrateCatalog();
        showToast("素材库暂时无法连接，已使用上次成功目录");
        return;
      } catch {
        safeStorage.removeItem(CATALOG_CACHE_KEY);
      }
    }
    setCatalogState("error", "素材库不可用");
    elements.catalogEmpty.hidden = false;
    elements.catalogEmpty.querySelector("strong").textContent = "素材服务尚未启动";
    elements.catalogEmpty.querySelector("span").textContent = "本地开发请运行 pnpm catalog";
    showToast(error instanceof Error ? error.message : "素材库加载失败");
  }
}

function hydrateCatalog() {
  const categories = state.manifest.categories || [];
  elements.categorySelect.innerHTML = '<option value="all">全部分类</option>';
  for (const category of categories) {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = category.label;
    elements.categorySelect.appendChild(option);
  }
  renderAssetGrid();
  if (!state.selectedAsset && state.manifest.items[0]) selectAsset(state.manifest.items[0].id);
}

function recentIds() {
  try {
    return JSON.parse(safeStorage.getItem(RECENT_KEY) || "[]");
  } catch {
    return [];
  }
}

function rememberRecent(id) {
  const next = [id, ...recentIds().filter((value) => value !== id)].slice(0, 12);
  safeStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

function renderRecentStrip() {
  if (!state.manifest) return;
  const items = recentIds()
    .map((id) => state.manifest.items.find((item) => item.id === id))
    .filter(Boolean)
    .slice(0, 3);
  elements.recentItems.replaceChildren();
  elements.recentStrip.hidden = items.length === 0;
  for (const item of items) {
    const button = document.createElement("button");
    button.className = `recent-item${state.selectedAsset?.id === item.id ? " active" : ""}`;
    button.title = item.name;
    const image = document.createElement("img");
    image.src = resolveAssetUrl(item.thumbnail);
    image.alt = item.name;
    button.appendChild(image);
    button.addEventListener("click", () => selectAsset(item.id));
    elements.recentItems.appendChild(button);
  }
}

function filteredItems() {
  if (!state.manifest) return [];
  const query = elements.searchInput.value.trim().toLocaleLowerCase("zh-CN");
  const category = elements.categorySelect.value;

  return state.manifest.items.filter((item) => {
    if (state.segment === "similar" && state.selectedAsset && item.category !== state.selectedAsset.category) return false;
    if (category !== "all" && item.category !== category) return false;
    if (query) {
      const haystack = [item.name, item.category, ...(item.tags || [])].join(" ").toLocaleLowerCase("zh-CN");
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

function renderAssetGrid() {
  const items = filteredItems();
  elements.assetGrid.replaceChildren();
  elements.catalogCount.textContent = `${items.length} 个样机`;
  elements.catalogEmpty.hidden = items.length !== 0;
  if (!items.length) {
    elements.catalogEmpty.querySelector("strong").textContent = "没有找到样机";
    elements.catalogEmpty.querySelector("span").textContent = "换个关键词或分类试试";
  }

  for (const item of items) {
    const button = document.createElement("button");
    button.className = `asset-card${state.selectedAsset?.id === item.id ? " active" : ""}`;
    button.dataset.assetId = item.id;

    const image = document.createElement("img");
    image.alt = item.name;
    image.src = resolveAssetUrl(item.thumbnail);
    image.loading = "lazy";

    const footer = document.createElement("footer");
    const name = document.createElement("strong");
    name.textContent = item.name;
    const meta = document.createElement("span");
    meta.textContent = item.status === "testing" ? "测试素材" : "静态样机";
    footer.append(name, meta);
    button.append(image, footer);
    button.addEventListener("click", () => selectAsset(item.id));
    elements.assetGrid.appendChild(button);
  }
  renderRecentStrip();
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("样机图片加载失败"));
    image.src = url;
  });
}

async function selectAsset(id) {
  const asset = state.manifest?.items.find((item) => item.id === id);
  if (!asset) return;
  state.selectedAsset = asset;
  state.customQuad = asset.screen.quad.map((point) => [...point]);
  rememberRecent(id);
  elements.fitMode.value = asset.screen.defaultFit || "cover";
  elements.assetName.textContent = asset.name;
  elements.assetMeta.textContent = `${asset.canvas.width} × ${asset.canvas.height} · ${asset.status === "testing" ? "测试库" : "素材库"}`;
  elements.downloadButton.disabled = true;
  elements.pasteButton.disabled = true;
  state.rendering = true;
  elements.renderingBadge.hidden = false;
  renderAssetGrid();

  try {
    state.baseImage = await loadImage(resolveAssetUrl(asset.layers.base));
    const optionalLayers = await Promise.all(["reflection", "foreground"].map(async (name) => {
      if (!asset.layers[name]) return [name, null];
      return [name, await loadImage(resolveAssetUrl(asset.layers[name]))];
    }));
    state.layerImages = Object.fromEntries(optionalLayers.filter(([, image]) => image));
    elements.previewCanvas.width = asset.canvas.width;
    elements.previewCanvas.height = asset.canvas.height;
    updatePerspectiveEditor();
    await renderComposite();
  } catch (error) {
    showToast(error instanceof Error ? error.message : "样机加载失败");
  } finally {
    state.rendering = false;
    elements.renderingBadge.hidden = true;
    updateOutputAvailability();
  }
}

function updateOutputAvailability() {
  const disabled = state.rendering || !state.baseImage || !state.designImage;
  elements.downloadButton.disabled = disabled;
  elements.pasteButton.disabled = disabled;
}

function activeQuad() {
  return state.customQuad || state.selectedAsset?.screen.quad || null;
}

async function renderComposite() {
  if (!state.selectedAsset || !state.baseImage) return;
  renderer.renderComposite({
    canvas: elements.previewCanvas,
    asset: state.selectedAsset,
    baseImage: state.baseImage,
    designImage: state.designImage,
    fit: elements.fitMode.value,
    adjustments: state.adjustments,
    quad: activeQuad(),
    layerImages: state.layerImages
  });
  if (state.designImage) {
    elements.screenCta.classList.add("has-image");
    elements.screenCta.querySelector("b").textContent = "重新读取选区";
  } else {
    elements.screenCta.classList.remove("has-image");
    elements.screenCta.querySelector("b").textContent = "选择 Figma 画面";
  }
  updatePerspectiveEditor();
}

function updatePerspectiveEditor() {
  const quad = activeQuad();
  if (!quad || !state.selectedAsset) return;
  elements.perspectivePolygon.setAttribute("points", quad.map((point) => point.join(",")).join(" "));
  const svg = elements.perspectivePolygon.ownerSVGElement;
  svg.setAttribute("viewBox", `0 0 ${state.selectedAsset.canvas.width} ${state.selectedAsset.canvas.height}`);
  for (const handle of elements.perspectiveEditor.querySelectorAll(".perspective-handle")) {
    const point = quad[Number(handle.dataset.corner)];
    handle.style.left = `${point[0] / state.selectedAsset.canvas.width * 100}%`;
    handle.style.top = `${point[1] / state.selectedAsset.canvas.height * 100}%`;
  }
}

function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll(".mode-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.mode === mode));
  elements.catalogView.hidden = mode !== "catalog";
  elements.adjustPanel.hidden = mode === "catalog";
  elements.perspectiveEditor.hidden = mode !== "perspective";
  elements.adjustPanelTitle.textContent = mode === "perspective" ? "透视编辑" : "画面调整";
  elements.stageTitle.textContent = mode === "perspective" ? "拖动四角控制点" : "预览";
  elements.designSourceLabel.textContent = mode === "perspective"
    ? "调整当前样机的屏幕四角，结果会直接写入导出图"
    : (state.designName || "尚未读取画面");
  updatePerspectiveEditor();
}

function syncAdjustmentControls() {
  const values = state.adjustments;
  elements.designScale.value = String(Math.round(values.scale * 100));
  elements.designOffsetX.value = String(Math.round(values.offsetX * 100));
  elements.designOffsetY.value = String(Math.round(values.offsetY * 100));
  elements.designRotation.value = String(Math.round(values.rotation));
  elements.designBrightness.value = String(Math.round(values.brightness * 100));
  elements.designContrast.value = String(Math.round(values.contrast * 100));
  elements.designSaturation.value = String(Math.round(values.saturation * 100));
  elements.designScaleValue.textContent = `${elements.designScale.value}%`;
  elements.designOffsetXValue.textContent = `${elements.designOffsetX.value}%`;
  elements.designOffsetYValue.textContent = `${elements.designOffsetY.value}%`;
  elements.designRotationValue.textContent = `${elements.designRotation.value}°`;
  elements.designBrightnessValue.textContent = `${elements.designBrightness.value}%`;
  elements.designContrastValue.textContent = `${elements.designContrast.value}%`;
  elements.designSaturationValue.textContent = `${elements.designSaturation.value}%`;
}

function updateAdjustmentsFromControls() {
  state.adjustments = {
    scale: Number(elements.designScale.value) / 100,
    offsetX: Number(elements.designOffsetX.value) / 100,
    offsetY: Number(elements.designOffsetY.value) / 100,
    rotation: Number(elements.designRotation.value),
    brightness: Number(elements.designBrightness.value) / 100,
    contrast: Number(elements.designContrast.value) / 100,
    saturation: Number(elements.designSaturation.value) / 100
  };
  syncAdjustmentControls();
  renderComposite();
}

async function setDesignBytes(bytes, name, mimeType = "image/png") {
  if (state.designObjectUrl) URL.revokeObjectURL(state.designObjectUrl);
  state.designObjectUrl = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  state.designImage = await loadImage(state.designObjectUrl);
  state.designName = name;
  elements.designSourceLabel.textContent = name;
  elements.clearDesignButton.disabled = false;
  await renderComposite();
  updateOutputAvailability();
}

function clearDesign() {
  if (state.designObjectUrl) URL.revokeObjectURL(state.designObjectUrl);
  state.designObjectUrl = null;
  state.designImage = null;
  state.designName = "";
  elements.designSourceLabel.textContent = "尚未读取画面";
  elements.clearDesignButton.disabled = true;
  elements.imageInput.value = "";
  updateOutputAvailability();
  renderComposite();
  showToast("已移除画面");
}

async function importImageFile(file) {
  if (!file) return;
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
    showToast("请选择 PNG、JPG 或 WebP 图片");
    elements.imageInput.value = "";
    return;
  }
  if (file.size > 20 * 1024 * 1024) {
    showToast("图片不能超过 20 MB");
    elements.imageInput.value = "";
    return;
  }
  try {
    await setDesignBytes(new Uint8Array(await file.arrayBuffer()), file.name, file.type);
    showToast(`已导入：${file.name}`);
  } catch {
    showToast("图片读取失败，请换一张图片重试");
  }
}

function resetAdjustments() {
  state.adjustments = { ...DEFAULT_ADJUSTMENTS };
  elements.fitMode.value = state.selectedAsset?.screen.defaultFit || "cover";
  syncAdjustmentControls();
  renderComposite();
  showToast("画面调整已恢复默认");
}

function resetPerspective() {
  if (!state.selectedAsset) return;
  state.customQuad = state.selectedAsset.screen.quad.map((point) => [...point]);
  renderComposite();
  showToast("样机透视已恢复默认");
}

function enablePerspectiveEditing() {
  for (const handle of elements.perspectiveEditor.querySelectorAll(".perspective-handle")) {
    handle.addEventListener("pointerdown", (event) => {
      handle.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    handle.addEventListener("pointermove", (event) => {
      if (!handle.hasPointerCapture(event.pointerId) || !state.selectedAsset) return;
      const rect = elements.previewCanvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(state.selectedAsset.canvas.width, (event.clientX - rect.left) / rect.width * state.selectedAsset.canvas.width));
      const y = Math.max(0, Math.min(state.selectedAsset.canvas.height, (event.clientY - rect.top) / rect.height * state.selectedAsset.canvas.height));
      state.customQuad[Number(handle.dataset.corner)] = [x, y];
      updatePerspectiveEditor();
      renderComposite();
    });
    handle.addEventListener("pointerup", (event) => {
      if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    });
  }
}

function requestSelection() {
  if (!state.selection?.available) {
    setMode("adjust");
    showToast(state.selection?.message || "请先在 Figma 画布中选择一个图层");
    return;
  }
  elements.readSelectionButton.disabled = true;
  elements.readSelectionButton.textContent = "读取中";
  postPluginMessage({ type: "request-selection" });
}

function canvasBlob() {
  return new Promise((resolve, reject) => {
    elements.previewCanvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("无法生成 PNG"));
    }, "image/png");
  });
}

async function downloadRender() {
  try {
    const blob = await canvasBlob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${state.selectedAsset?.id || "mockup"}.png`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("PNG 已导出");
  } catch (error) {
    showToast(error instanceof Error ? error.message : "导出失败");
  }
}

async function pasteRender() {
  try {
    elements.pasteButton.disabled = true;
    elements.pasteButton.textContent = "正在粘贴";
    const blob = await canvasBlob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    postPluginMessage({
      type: "paste-render",
      bytes,
      width: elements.previewCanvas.width,
      height: elements.previewCanvas.height,
      name: `${state.selectedAsset?.name || "样机"} · 样机工作室`
    });
  } catch (error) {
    elements.pasteButton.disabled = false;
    elements.pasteButton.textContent = "粘贴到画布";
    showToast(error instanceof Error ? error.message : "粘贴失败");
  }
}

function updateZoom(delta) {
  state.zoom = Math.max(0.7, Math.min(1.5, state.zoom + delta));
  elements.canvasWrap.style.transform = `scale(${state.zoom})`;
  elements.zoomReset.textContent = `${Math.round(state.zoom * 100)}%`;
}

function fitStage() {
  state.zoom = 1;
  elements.canvasWrap.style.transform = "scale(1)";
  elements.zoomReset.textContent = "适应";
}

function setWindowState(windowState) {
  const collapsed = windowState === "collapsed";
  document.documentElement.classList.toggle("is-collapsed", collapsed);
  elements.collapsedBar.setAttribute("aria-hidden", String(!collapsed));
  postPluginMessage({ type: "set-window-state", state: windowState });
}

function enableWindowResize() {
  let startX = 0;
  let startY = 0;
  let startWidth = 0;
  let startHeight = 0;
  let animationFrame = 0;

  elements.resizeGrip.addEventListener("pointerdown", (event) => {
    startX = event.clientX;
    startY = event.clientY;
    startWidth = window.innerWidth;
    startHeight = window.innerHeight;
    elements.resizeGrip.setPointerCapture(event.pointerId);
  });

  elements.resizeGrip.addEventListener("pointermove", (event) => {
    if (!elements.resizeGrip.hasPointerCapture(event.pointerId)) return;
    cancelAnimationFrame(animationFrame);
    animationFrame = requestAnimationFrame(() => {
      postPluginMessage({
        type: "resize",
        width: startWidth + event.clientX - startX,
        height: startHeight + event.clientY - startY
      });
    });
  });

  elements.resizeGrip.addEventListener("pointerup", (event) => {
    if (elements.resizeGrip.hasPointerCapture(event.pointerId)) {
      elements.resizeGrip.releasePointerCapture(event.pointerId);
    }
  });
}

for (const tab of document.querySelectorAll(".mode-tab")) {
  tab.addEventListener("click", () => setMode(tab.dataset.mode));
}

for (const segment of document.querySelectorAll(".segment")) {
  segment.addEventListener("click", () => {
    state.segment = segment.dataset.filter;
    document.querySelectorAll(".segment").forEach((item) => item.classList.toggle("active", item === segment));
    renderAssetGrid();
  });
}

elements.refreshButton.addEventListener("click", fetchCatalog);
elements.searchInput.addEventListener("input", () => {
  elements.clearSearch.hidden = !elements.searchInput.value;
  renderAssetGrid();
});
elements.clearSearch.addEventListener("click", () => {
  elements.searchInput.value = "";
  elements.clearSearch.hidden = true;
  elements.searchInput.focus();
  renderAssetGrid();
});
elements.categorySelect.addEventListener("change", renderAssetGrid);
elements.fitMode.addEventListener("change", renderComposite);
elements.readSelectionButton.addEventListener("click", requestSelection);
elements.imageInput.addEventListener("change", () => importImageFile(elements.imageInput.files?.[0]));
elements.clearDesignButton.addEventListener("click", clearDesign);
for (const control of [
  elements.designScale,
  elements.designOffsetX,
  elements.designOffsetY,
  elements.designRotation,
  elements.designBrightness,
  elements.designContrast,
  elements.designSaturation
]) control.addEventListener("input", updateAdjustmentsFromControls);
elements.resetAdjustmentsButton.addEventListener("click", resetAdjustments);
elements.resetPerspectiveButton.addEventListener("click", resetPerspective);
elements.screenCta.addEventListener("click", requestSelection);
elements.downloadButton.addEventListener("click", downloadRender);
elements.pasteButton.addEventListener("click", pasteRender);
elements.backgroundToggle.addEventListener("click", () => elements.stage.classList.toggle("light"));
elements.zoomIn.addEventListener("click", () => updateZoom(0.1));
elements.zoomOut.addEventListener("click", () => updateZoom(-0.1));
elements.zoomReset.addEventListener("click", fitStage);
elements.clearRecent.addEventListener("click", () => {
  safeStorage.removeItem(RECENT_KEY);
  renderRecentStrip();
});
elements.collapseButton.addEventListener("click", () => setWindowState("collapsed"));
elements.expandButton.addEventListener("click", () => setWindowState("expanded"));
syncAdjustmentControls();
enablePerspectiveEditing();
enableWindowResize();

window.onmessage = async (event) => {
  const message = event.data.pluginMessage;
  if (!message || typeof message.type !== "string") return;

  if (message.type === "selection-state") {
    state.selection = message.selection;
    elements.selectionText.textContent = message.selection.message;
    elements.selectionChip.classList.toggle("ready", Boolean(message.selection.available));
    elements.readSelectionButton.disabled = !message.selection.available;
    return;
  }

  if (message.type === "catalog-cache") {
    state.pluginCatalogCache = message.cache;
    if (!state.manifest && message.cache) {
      try {
        state.manifest = validateManifest(message.cache.manifest);
        state.catalogBaseUrl = message.cache.catalogBaseUrl;
        setCatalogState("cached", "使用离线目录");
        hydrateCatalog();
      } catch {
        state.pluginCatalogCache = null;
      }
    }
    return;
  }

  if (message.type === "selection-image") {
    elements.readSelectionButton.disabled = false;
    elements.readSelectionButton.textContent = "重新读取 Figma 选区";
    await setDesignBytes(message.bytes, message.name);
    showToast(`已放入：${message.name}`);
    return;
  }

  if (message.type === "selection-error") {
    elements.readSelectionButton.disabled = false;
    elements.readSelectionButton.textContent = "读取选区";
    showToast(message.message);
    return;
  }

  if (message.type === "paste-complete") {
    elements.pasteButton.disabled = false;
    elements.pasteButton.textContent = "粘贴到画布";
    showToast("样机已粘贴到 Figma 画布");
    return;
  }

  if (message.type === "paste-error") {
    elements.pasteButton.disabled = false;
    elements.pasteButton.textContent = "粘贴到画布";
    showToast(message.message);
  }
};

elements.downloadButton.disabled = true;
elements.pasteButton.disabled = true;
postPluginMessage({ type: "ready" });
fetchCatalog();

void PRODUCTION_CATALOG_URL;
