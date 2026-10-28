const PLUGIN_VERSION = "0.1.0";
const DEVELOPMENT_CATALOG_URL = "http://localhost:4173/catalog/testing/v1/manifest.json";
const PRODUCTION_CATALOG_URL = "https://assets.mockup-studio.example/v1/manifest.json";
const ACTIVE_CATALOG_URL = DEVELOPMENT_CATALOG_URL;
const renderer = window.MockupRenderer;
const pdfjs = window.pdfjsLib;
const CATALOG_CACHE_KEY = "mockup-studio-catalog-v1";
const RECENT_KEY = "mockup-studio-recent-v1";
const memoryStorage = new Map();

let pdfWorkerUrl = "";
if (pdfjs && window.__PDF_WORKER_SOURCE__) {
  pdfWorkerUrl = URL.createObjectURL(new Blob([window.__PDF_WORKER_SOURCE__], { type: "text/javascript" }));
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

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
  adjustControls: document.querySelector("#adjustControls"),
  perspectiveControls: document.querySelector("#perspectiveControls"),
  adjustPanelTitle: document.querySelector("#adjustPanelTitle"),
  assetGrid: document.querySelector("#assetGrid"),
  catalogEmpty: document.querySelector("#catalogEmpty"),
  selectionChip: document.querySelector("#selectionChip"),
  selectionText: document.querySelector("#selectionText"),
  readSelectionButton: document.querySelector("#readSelectionButton"),
  importFileButton: document.querySelector("#importFileButton"),
  imageInput: document.querySelector("#imageInput"),
  clearDesignButton: document.querySelector("#clearDesignButton"),
  designSourceLabel: document.querySelector("#designSourceLabel"),
  sourceGuide: document.querySelector("#sourceGuide"),
  recommendedSize: document.querySelector("#recommendedSize"),
  recommendedRatio: document.querySelector("#recommendedRatio"),
  sourceMatch: document.querySelector("#sourceMatch"),
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
  replaceSourceButton: document.querySelector("#replaceSourceButton"),
  resetCurrentButton: document.querySelector("#resetCurrentButton"),
  sourcePopover: document.querySelector("#sourcePopover"),
  quickReadSelectionButton: document.querySelector("#quickReadSelectionButton"),
  quickImportFileButton: document.querySelector("#quickImportFileButton"),
  quickClearDesignButton: document.querySelector("#quickClearDesignButton"),
  quickSelectionLabel: document.querySelector("#quickSelectionLabel"),
  designEditor: document.querySelector("#designEditor"),
  designPolygon: document.querySelector("#designPolygon"),
  designDragTarget: document.querySelector("#designDragTarget"),
  designEditorHint: document.querySelector("#designEditorHint"),
  perspectiveEditor: document.querySelector("#perspectiveEditor"),
  perspectivePolygon: document.querySelector("#perspectivePolygon"),
  perspectiveStatus: document.querySelector("#perspectiveStatus"),
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
  designSource: null,
  selection: null,
  segment: "all",
  mode: "catalog",
  zoom: 1,
  panX: 0,
  panY: 0,
  designSelected: false,
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
      name: "首页设计稿（预览模拟）",
      sourceType: "Figma 画框"
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
  const similarCategory = category !== "all" ? category : state.selectedAsset?.category;

  return state.manifest.items.filter((item) => {
    if (state.segment === "similar" && similarCategory && item.category !== similarCategory) return false;
    if (category !== "all" && item.category !== category) return false;
    if (query) {
      const haystack = [item.name, item.category, ...(item.tags || [])].join(" ").toLocaleLowerCase("zh-CN");
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

function hoverTiltFor(id) {
  let hash = 0;
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return Math.abs(hash) % 2 === 0 ? -10 : 10;
}

function renderAssetGrid() {
  const items = filteredItems();
  elements.assetGrid.replaceChildren();
  elements.catalogCount.textContent = `${items.length} 个样机`;
  elements.catalogEmpty.hidden = items.length !== 0;
  if (!items.length) {
    elements.catalogEmpty.querySelector("strong").textContent = state.segment === "similar" ? "该分类暂无相似样机" : "没有找到样机";
    elements.catalogEmpty.querySelector("span").textContent = elements.searchInput.value ? "清空搜索或更换关键词" : "更换分类后再试";
  }

  for (const item of items) {
    const button = document.createElement("button");
    button.className = `asset-card${state.selectedAsset?.id === item.id ? " active" : ""}`;
    button.dataset.assetId = item.id;
    button.style.setProperty("--hover-tilt", `${hoverTiltFor(item.id)}deg`);

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
  const assetChanged = state.selectedAsset?.id !== id;
  state.selectedAsset = asset;
  if (assetChanged) {
    state.customQuad = asset.screen.quad.map((point) => [...point]);
    state.adjustments = { ...DEFAULT_ADJUSTMENTS };
    state.designSelected = state.mode === "adjust" && Boolean(state.designImage);
  }
  closeSourcePopover();
  rememberRecent(id);
  elements.fitMode.value = asset.screen.defaultFit || "contain";
  syncAdjustmentControls();
  updateSourceGuide();
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
    if (assetChanged) fitStage();
    updatePerspectiveEditor();
    updateDesignEditor();
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

function updateSourceActions() {
  const hasDesign = Boolean(state.designImage);
  const hasSelection = Boolean(state.selection?.available);
  elements.replaceSourceButton.textContent = hasDesign ? "换画面" : "添加画面";
  elements.screenCta.querySelector("b").textContent = hasDesign ? "换画面" : "添加画面";
  elements.quickClearDesignButton.hidden = !hasDesign;
  elements.quickReadSelectionButton.disabled = !hasSelection;
  elements.quickSelectionLabel.textContent = hasSelection
    ? state.selection.message.replace(/^已选择[： ]*/, "")
    : "先在 Figma 画布中选择内容";
}

function openSourcePopover() {
  updateSourceActions();
  elements.sourcePopover.hidden = false;
  requestAnimationFrame(() => {
    const target = elements.quickReadSelectionButton.disabled ? elements.quickImportFileButton : elements.quickReadSelectionButton;
    target.focus();
  });
}

function closeSourcePopover() {
  elements.sourcePopover.hidden = true;
}

function toggleSourcePopover() {
  if (elements.sourcePopover.hidden) openSourcePopover();
  else closeSourcePopover();
}

function activeQuad() {
  return state.customQuad || state.selectedAsset?.screen.quad || null;
}

function updateSourceGuide() {
  const recommended = state.selectedAsset?.screen?.recommendedSize;
  elements.sourceGuide.classList.remove("match", "mismatch");
  if (!recommended) {
    elements.recommendedSize.textContent = "选择样机后显示";
    elements.recommendedRatio.textContent = "用于避免比例错误";
    elements.sourceMatch.textContent = "读取内容后会统一作为一个画面对象。";
    return;
  }
  elements.recommendedSize.textContent = `${recommended.width} × ${recommended.height} px`;
  elements.recommendedRatio.textContent = `${recommended.label} · 默认完整显示且保持原比例`;
  if (!state.designSource) {
    elements.sourceMatch.textContent = "读取内容后，可直接在预览中拖动，拖动四角可等比缩放。";
    return;
  }
  const expectedAspect = recommended.width / recommended.height;
  const sourceAspect = state.designSource.width / state.designSource.height;
  const matches = Math.abs(sourceAspect / expectedAspect - 1) <= 0.03;
  elements.sourceGuide.classList.add(matches ? "match" : "mismatch");
  const sourceLabel = `${state.designSource.width} × ${state.designSource.height} px · ${state.designSource.type}`;
  elements.sourceMatch.textContent = matches
    ? `当前 ${sourceLabel}，比例匹配。`
    : `当前 ${sourceLabel}，比例不一致；已保持原比例完整显示，可拖动或等比缩放调整。`;
}

function designControlPoints() {
  if (!state.selectedAsset || !state.designImage) return [];
  const recommended = state.selectedAsset.screen.recommendedSize;
  const screenWidth = 1200;
  const screenHeight = screenWidth / (recommended.width / recommended.height);
  const sourceWidth = state.designImage.naturalWidth || state.designImage.width;
  const sourceHeight = state.designImage.naturalHeight || state.designImage.height;
  const fitScale = elements.fitMode.value === "cover"
    ? Math.max(screenWidth / sourceWidth, screenHeight / sourceHeight)
    : Math.min(screenWidth / sourceWidth, screenHeight / sourceHeight);
  const halfWidth = sourceWidth * fitScale * state.adjustments.scale / 2;
  const halfHeight = sourceHeight * fitScale * state.adjustments.scale / 2;
  const centerX = screenWidth / 2 + state.adjustments.offsetX * screenWidth * 0.42;
  const centerY = screenHeight / 2 + state.adjustments.offsetY * screenHeight * 0.42;
  const angle = state.adjustments.rotation * Math.PI / 180;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const corners = [[-halfWidth, -halfHeight], [halfWidth, -halfHeight], [halfWidth, halfHeight], [-halfWidth, halfHeight]];
  return corners.map(([x, y]) => {
    const u = (centerX + x * cosine - y * sine) / screenWidth;
    const v = (centerY + x * sine + y * cosine) / screenHeight;
    return renderer.bilinearPoint(activeQuad(), u, v);
  });
}

function midpoint(first, second) {
  return [(first[0] + second[0]) / 2, (first[1] + second[1]) / 2];
}

function designHandlePoints(points) {
  if (points.length !== 4) return {};
  return {
    nw: points[0],
    n: midpoint(points[0], points[1]),
    ne: points[1],
    e: midpoint(points[1], points[2]),
    se: points[2],
    s: midpoint(points[2], points[3]),
    sw: points[3],
    w: midpoint(points[3], points[0])
  };
}

function updateDesignEditor() {
  const points = designControlPoints();
  const visible = state.mode !== "perspective" && points.length === 4;
  elements.designEditor.hidden = !visible;
  if (!visible) return;
  elements.designEditor.classList.toggle("is-selected", state.designSelected);
  const pointString = points.map((point) => point.join(",")).join(" ");
  elements.designPolygon.setAttribute("points", pointString);
  elements.designDragTarget.setAttribute("points", pointString);
  const svg = elements.designPolygon.ownerSVGElement;
  svg.setAttribute("viewBox", `0 0 ${state.selectedAsset.canvas.width} ${state.selectedAsset.canvas.height}`);
  const handlePoints = designHandlePoints(points);
  for (const handle of elements.designEditor.querySelectorAll(".design-scale-handle")) {
    const point = handlePoints[handle.dataset.handle];
    handle.style.left = `${point[0] / state.selectedAsset.canvas.width * 100}%`;
    handle.style.top = `${point[1] / state.selectedAsset.canvas.height * 100}%`;
  }
  const center = points.reduce((sum, point) => [sum[0] + point[0] / 4, sum[1] + point[1] / 4], [0, 0]);
  const top = Math.min(...points.map((point) => point[1]));
  elements.designEditorHint.style.left = `${Math.max(8, Math.min(92, center[0] / state.selectedAsset.canvas.width * 100))}%`;
  elements.designEditorHint.style.top = `${Math.max(8, Math.min(96, top / state.selectedAsset.canvas.height * 100))}%`;
}

function pointOnCanvas(event) {
  const rect = elements.previewCanvas.getBoundingClientRect();
  return [
    (event.clientX - rect.left) / rect.width * state.selectedAsset.canvas.width,
    (event.clientY - rect.top) / rect.height * state.selectedAsset.canvas.height
  ];
}

function deltaToScreenCoordinates(dx, dy) {
  const quad = activeQuad();
  const center = renderer.bilinearPoint(quad, 0.5, 0.5);
  const alongX = renderer.bilinearPoint(quad, 0.51, 0.5);
  const alongY = renderer.bilinearPoint(quad, 0.5, 0.51);
  const ux = (alongX[0] - center[0]) * 100;
  const uy = (alongX[1] - center[1]) * 100;
  const vx = (alongY[0] - center[0]) * 100;
  const vy = (alongY[1] - center[1]) * 100;
  const determinant = ux * vy - uy * vx;
  if (Math.abs(determinant) < 0.0001) return [0, 0];
  return [(dx * vy - dy * vx) / determinant, (ux * dy - uy * dx) / determinant];
}

function commitDirectAdjustment() {
  syncAdjustmentControls();
  updateDesignEditor();
  scheduleComposite("preview");
}

function enableDesignEditing() {
  let interaction = null;
  const oppositeHandle = { nw: "se", n: "s", ne: "sw", e: "w", se: "nw", s: "n", sw: "ne", w: "e" };
  const start = (event, type) => {
    if (!state.designImage || !state.selectedAsset) return;
    const points = designControlPoints();
    const handles = designHandlePoints(points);
    const center = points.reduce((sum, point) => [sum[0] + point[0] / 4, sum[1] + point[1] / 4], [0, 0]);
    const pointer = pointOnCanvas(event);
    const handleName = event.currentTarget.dataset.handle;
    const anchor = handleName ? handles[oppositeHandle[handleName]] : center;
    const handlePoint = handleName ? handles[handleName] : pointer;
    state.designSelected = true;
    updateDesignEditor();
    interaction = {
      type,
      handleName,
      startPointer: pointer,
      center,
      anchor,
      startScale: state.adjustments.scale,
      startOffsetX: state.adjustments.offsetX,
      startOffsetY: state.adjustments.offsetY,
      startDistance: Math.max(1, Math.hypot(handlePoint[0] - anchor[0], handlePoint[1] - anchor[1]))
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  };
  const move = (event) => {
    if (!interaction || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const pointer = pointOnCanvas(event);
    if (interaction.type === "move") {
      const [du, dv] = deltaToScreenCoordinates(pointer[0] - interaction.startPointer[0], pointer[1] - interaction.startPointer[1]);
      state.adjustments.offsetX = Math.max(-1, Math.min(1, interaction.startOffsetX + du / 0.42));
      state.adjustments.offsetY = Math.max(-1, Math.min(1, interaction.startOffsetY + dv / 0.42));
    } else {
      const distance = Math.hypot(pointer[0] - interaction.anchor[0], pointer[1] - interaction.anchor[1]);
      const ratio = Math.max(0.2 / interaction.startScale, Math.min(4 / interaction.startScale, distance / interaction.startDistance));
      const nextCenter = [
        interaction.anchor[0] + (interaction.center[0] - interaction.anchor[0]) * ratio,
        interaction.anchor[1] + (interaction.center[1] - interaction.anchor[1]) * ratio
      ];
      const [du, dv] = deltaToScreenCoordinates(nextCenter[0] - interaction.center[0], nextCenter[1] - interaction.center[1]);
      state.adjustments.scale = interaction.startScale * ratio;
      state.adjustments.offsetX = Math.max(-1, Math.min(1, interaction.startOffsetX + du / 0.42));
      state.adjustments.offsetY = Math.max(-1, Math.min(1, interaction.startOffsetY + dv / 0.42));
    }
    commitDirectAdjustment();
    event.preventDefault();
  };
  const end = (event) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    interaction = null;
    renderFinalComposite();
    event.stopPropagation();
  };
  elements.designDragTarget.addEventListener("pointerdown", (event) => start(event, "move"));
  elements.designDragTarget.addEventListener("pointermove", move);
  elements.designDragTarget.addEventListener("pointerup", end);
  elements.designDragTarget.addEventListener("pointercancel", end);
  elements.designDragTarget.addEventListener("dblclick", (event) => {
    openSourcePopover();
    event.preventDefault();
    event.stopPropagation();
  });
  elements.designDragTarget.addEventListener("keydown", (event) => {
    const step = event.shiftKey ? 0.05 : 0.01;
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    if (event.key === "ArrowLeft") state.adjustments.offsetX -= step;
    if (event.key === "ArrowRight") state.adjustments.offsetX += step;
    if (event.key === "ArrowUp") state.adjustments.offsetY -= step;
    if (event.key === "ArrowDown") state.adjustments.offsetY += step;
    state.adjustments.offsetX = Math.max(-1, Math.min(1, state.adjustments.offsetX));
    state.adjustments.offsetY = Math.max(-1, Math.min(1, state.adjustments.offsetY));
    commitDirectAdjustment();
    renderFinalComposite();
    event.preventDefault();
  });
  for (const handle of elements.designEditor.querySelectorAll(".design-scale-handle")) {
    handle.addEventListener("pointerdown", (event) => start(event, "scale"));
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
    handle.addEventListener("keydown", (event) => {
      if (!["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"].includes(event.key)) return;
      const direction = ["ArrowUp", "ArrowRight"].includes(event.key) ? 1 : -1;
      state.adjustments.scale = Math.max(0.2, Math.min(4, state.adjustments.scale + direction * (event.shiftKey ? 0.1 : 0.02)));
      commitDirectAdjustment();
      renderFinalComposite();
      event.preventDefault();
    });
  }
}

let scheduledRenderFrame = 0;
let scheduledRenderQuality = "preview";

function renderComposite(quality = "final") {
  if (!state.selectedAsset || !state.baseImage) return;
  renderer.renderComposite({
    canvas: elements.previewCanvas,
    asset: state.selectedAsset,
    baseImage: state.baseImage,
    designImage: state.designImage,
    fit: elements.fitMode.value,
    adjustments: state.adjustments,
    quad: activeQuad(),
    layerImages: state.layerImages,
    quality
  });
  if (state.designImage) {
    elements.screenCta.classList.add("has-image");
  } else {
    elements.screenCta.classList.remove("has-image");
  }
  updateSourceActions();
  updateDesignEditor();
  updatePerspectiveEditor();
}

function scheduleComposite(quality = "preview") {
  if (quality === "final") scheduledRenderQuality = "final";
  if (scheduledRenderFrame) return;
  scheduledRenderFrame = requestAnimationFrame(() => {
    scheduledRenderFrame = 0;
    const nextQuality = scheduledRenderQuality;
    scheduledRenderQuality = "preview";
    renderComposite(nextQuality);
  });
}

function renderFinalComposite() {
  if (scheduledRenderFrame) cancelAnimationFrame(scheduledRenderFrame);
  scheduledRenderFrame = 0;
  scheduledRenderQuality = "preview";
  renderComposite("final");
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
  const original = state.selectedAsset.screen.quad;
  const unchanged = quad.every((point, index) => point.every((value, axis) => Math.abs(value - original[index][axis]) < 0.5));
  elements.perspectiveStatus.textContent = unchanged ? "默认透视" : "已调整";
}

function setMode(mode) {
  state.mode = mode;
  if (mode === "adjust" && state.designImage) state.designSelected = true;
  if (mode === "perspective") state.designSelected = false;
  closeSourcePopover();
  document.querySelectorAll(".mode-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.mode === mode));
  elements.catalogView.hidden = mode !== "catalog";
  elements.adjustPanel.hidden = mode === "catalog";
  elements.adjustControls.hidden = mode !== "adjust";
  elements.perspectiveControls.hidden = mode !== "perspective";
  elements.designEditor.hidden = mode === "perspective" || !state.designImage;
  elements.perspectiveEditor.hidden = mode !== "perspective";
  elements.adjustPanelTitle.textContent = mode === "perspective" ? "透视编辑" : "画面调整";
  elements.stageTitle.textContent = mode === "perspective" ? "拖动四角控制点" : mode === "adjust" ? "拖动画面或八向缩放" : "预览";
  elements.designSourceLabel.textContent = state.designName || "尚未读取画面";
  updateDesignEditor();
  updatePerspectiveEditor();
}

function updateAdjustmentOutputs() {
  elements.designScaleValue.textContent = `${elements.designScale.value}%`;
  elements.designOffsetXValue.textContent = `${elements.designOffsetX.value}%`;
  elements.designOffsetYValue.textContent = `${elements.designOffsetY.value}%`;
  elements.designRotationValue.textContent = `${elements.designRotation.value}°`;
  elements.designBrightnessValue.textContent = `${elements.designBrightness.value}%`;
  elements.designContrastValue.textContent = `${elements.designContrast.value}%`;
  elements.designSaturationValue.textContent = `${elements.designSaturation.value}%`;
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
  updateAdjustmentOutputs();
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
  updateAdjustmentOutputs();
  updateDesignEditor();
  scheduleComposite("preview");
}

async function setDesignBytes(bytes, name, mimeType = "image/png", metadata = {}) {
  if (state.designObjectUrl) URL.revokeObjectURL(state.designObjectUrl);
  state.designObjectUrl = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  state.designImage = await loadImage(state.designObjectUrl);
  state.designName = name;
  state.designSource = {
    width: Math.round(metadata.width || state.designImage.naturalWidth || state.designImage.width),
    height: Math.round(metadata.height || state.designImage.naturalHeight || state.designImage.height),
    type: metadata.type || "图片"
  };
  state.designSelected = true;
  state.adjustments = { ...DEFAULT_ADJUSTMENTS };
  elements.fitMode.value = state.selectedAsset?.screen.defaultFit || "contain";
  syncAdjustmentControls();
  elements.designSourceLabel.textContent = name;
  elements.clearDesignButton.disabled = false;
  closeSourcePopover();
  updateSourceActions();
  updateSourceGuide();
  await renderComposite();
  updateOutputAvailability();
}

function clearDesign() {
  if (state.designObjectUrl) URL.revokeObjectURL(state.designObjectUrl);
  state.designObjectUrl = null;
  state.designImage = null;
  state.designName = "";
  state.designSource = null;
  state.designSelected = false;
  elements.designSourceLabel.textContent = "尚未读取画面";
  elements.clearDesignButton.disabled = true;
  elements.imageInput.value = "";
  closeSourcePopover();
  updateSourceActions();
  updateSourceGuide();
  updateOutputAvailability();
  renderFinalComposite();
  showToast("已移除画面");
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("无法生成画面")), "image/png"));
}

async function setDesignCanvas(canvas, name, type) {
  const blob = await canvasToBlob(canvas);
  await setDesignBytes(new Uint8Array(await blob.arrayBuffer()), name, "image/png", { width: canvas.width, height: canvas.height, type });
}

async function composeSelectionLayers(message) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(message.width));
  canvas.height = Math.max(1, Math.round(message.height));
  const context = canvas.getContext("2d");
  for (const layer of message.layers || []) {
    const url = URL.createObjectURL(new Blob([layer.bytes], { type: "image/png" }));
    try {
      const image = await loadImage(url);
      context.drawImage(image, layer.x, layer.y, layer.width, layer.height);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  await setDesignCanvas(canvas, message.name, message.sourceType || "Figma 选区");
}

async function importVideoFile(file) {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  try {
    await new Promise((resolve, reject) => {
      video.addEventListener("loadeddata", resolve, { once: true });
      video.addEventListener("error", () => reject(new Error("视频格式无法读取")), { once: true });
      video.src = url;
    });
    const scale = Math.min(1, 2048 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    await setDesignCanvas(canvas, `${file.name} · 静态帧`, "视频静态帧");
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

async function importPdfFile(file) {
  if (!pdfjs) throw new Error("PDF 解析器尚未载入");
  const documentTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pdf = await documentTask.promise;
  const page = await pdf.getPage(1);
  const initial = page.getViewport({ scale: 1 });
  const scale = Math.min(2, 2048 / Math.max(initial.width, initial.height));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  await setDesignCanvas(canvas, `${file.name} · 第 1 页`, `PDF 第 1 页 / 共 ${pdf.numPages} 页`);
  await pdf.destroy();
}

async function importDesignFile(file) {
  if (!file) return;
  const extension = file.name.split(".").pop()?.toLowerCase();
  const supportedImage = /^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type) || extension === "svg";
  const supportedVideo = file.type.startsWith("video/") || ["mp4", "webm", "mov"].includes(extension);
  const supportedPdf = file.type === "application/pdf" || extension === "pdf";
  if (!supportedImage && !supportedVideo && !supportedPdf) {
    showToast("支持 PNG、JPG、WebP、SVG、MP4、WebM、MOV 和 PDF");
    elements.imageInput.value = "";
    return;
  }
  if (file.size > 80 * 1024 * 1024) {
    showToast("文件不能超过 80 MB");
    elements.imageInput.value = "";
    return;
  }
  try {
    if (supportedVideo) await importVideoFile(file);
    else if (supportedPdf) await importPdfFile(file);
    else await setDesignBytes(new Uint8Array(await file.arrayBuffer()), file.name, file.type || "image/svg+xml", { type: extension === "svg" ? "SVG" : "图片" });
    showToast(`已导入：${file.name}`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : "文件读取失败，请换一个文件重试");
  } finally {
    elements.imageInput.value = "";
  }
}

function resetAdjustments() {
  state.adjustments = { ...DEFAULT_ADJUSTMENTS };
  elements.fitMode.value = state.selectedAsset?.screen.defaultFit || "contain";
  syncAdjustmentControls();
  renderFinalComposite();
  showToast("画面调整已恢复默认");
}

function resetPerspective() {
  if (!state.selectedAsset) return;
  state.customQuad = state.selectedAsset.screen.quad.map((point) => [...point]);
  renderFinalComposite();
  showToast("样机透视已恢复默认");
}

function resetCurrentMockup() {
  if (!state.selectedAsset) return;
  state.adjustments = { ...DEFAULT_ADJUSTMENTS };
  state.customQuad = state.selectedAsset.screen.quad.map((point) => [...point]);
  elements.fitMode.value = state.selectedAsset.screen.defaultFit || "contain";
  state.designSelected = Boolean(state.designImage);
  syncAdjustmentControls();
  fitStage();
  renderFinalComposite();
  showToast("已恢复当前样机默认效果");
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
      scheduleComposite("preview");
    });
    handle.addEventListener("pointerup", (event) => {
      if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
      renderFinalComposite();
    });
    handle.addEventListener("pointercancel", renderFinalComposite);
  }
}

function requestSelection() {
  if (!state.selection?.available) {
    showToast(state.selection?.message || "请先在 Figma 画布中选择一个图层");
    return;
  }
  elements.readSelectionButton.disabled = true;
  elements.readSelectionButton.textContent = "读取中";
  elements.quickReadSelectionButton.disabled = true;
  closeSourcePopover();
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
    renderFinalComposite();
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
    renderFinalComposite();
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

function applyStageView() {
  elements.canvasWrap.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
  elements.zoomReset.textContent = state.zoom === 1 && state.panX === 0 && state.panY === 0 ? "适应" : `${Math.round(state.zoom * 100)}%`;
}

function setStageZoom(nextZoom, clientX, clientY) {
  const zoom = Math.max(0.5, Math.min(3, nextZoom));
  const rect = elements.stage.getBoundingClientRect();
  const focusX = Number.isFinite(clientX) ? clientX - (rect.left + rect.width / 2) : 0;
  const focusY = Number.isFinite(clientY) ? clientY - (rect.top + rect.height / 2) : 0;
  const contentX = (focusX - state.panX) / state.zoom;
  const contentY = (focusY - state.panY) / state.zoom;
  state.panX = focusX - contentX * zoom;
  state.panY = focusY - contentY * zoom;
  state.zoom = zoom;
  applyStageView();
}

function updateZoom(delta) {
  setStageZoom(state.zoom + delta);
}

function fitStage() {
  state.zoom = 1;
  state.panX = 0;
  state.panY = 0;
  applyStageView();
}

function enableStageNavigation() {
  let interaction = null;
  let spacePressed = false;

  window.addEventListener("keydown", (event) => {
    if (event.code === "Space" && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement?.tagName || "")) {
      spacePressed = true;
      event.preventDefault();
    }
    if (event.key === "Escape") {
      closeSourcePopover();
      state.designSelected = false;
      updateDesignEditor();
    }
  });
  window.addEventListener("keyup", (event) => {
    if (event.code === "Space") spacePressed = false;
  });

  elements.stage.addEventListener("wheel", (event) => {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      const factor = Math.exp(-event.deltaY * 0.01);
      setStageZoom(state.zoom * factor, event.clientX, event.clientY);
    } else {
      state.panX -= event.deltaX;
      state.panY -= event.deltaY;
      applyStageView();
    }
  }, { passive: false });

  elements.stage.addEventListener("pointerdown", (event) => {
    const overInteractive = event.target.closest("button, .design-drag-target, .design-scale-handle, .perspective-handle, .source-popover");
    const canPan = event.button === 1 || spacePressed || (!overInteractive && event.button === 0);
    if (!canPan) return;
    if (!overInteractive && state.designSelected) {
      state.designSelected = false;
      updateDesignEditor();
    }
    interaction = { x: event.clientX, y: event.clientY, panX: state.panX, panY: state.panY };
    elements.stage.setPointerCapture(event.pointerId);
    elements.stage.classList.add("is-panning");
    event.preventDefault();
  });

  elements.stage.addEventListener("pointermove", (event) => {
    if (!interaction || !elements.stage.hasPointerCapture(event.pointerId)) return;
    state.panX = interaction.panX + event.clientX - interaction.x;
    state.panY = interaction.panY + event.clientY - interaction.y;
    applyStageView();
  });

  const finishPan = (event) => {
    if (elements.stage.hasPointerCapture(event.pointerId)) elements.stage.releasePointerCapture(event.pointerId);
    interaction = null;
    elements.stage.classList.remove("is-panning");
  };
  elements.stage.addEventListener("pointerup", finishPan);
  elements.stage.addEventListener("pointercancel", finishPan);
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
elements.fitMode.addEventListener("change", () => {
  updateDesignEditor();
  renderFinalComposite();
});
elements.readSelectionButton.addEventListener("click", requestSelection);
elements.importFileButton.addEventListener("click", () => elements.imageInput.click());
elements.imageInput.addEventListener("change", () => importDesignFile(elements.imageInput.files?.[0]));
elements.clearDesignButton.addEventListener("click", clearDesign);
for (const control of [
  elements.designScale,
  elements.designOffsetX,
  elements.designOffsetY,
  elements.designRotation,
  elements.designBrightness,
  elements.designContrast,
  elements.designSaturation
]) {
  control.addEventListener("input", updateAdjustmentsFromControls);
  control.addEventListener("change", renderFinalComposite);
}
elements.resetAdjustmentsButton.addEventListener("click", resetAdjustments);
elements.resetPerspectiveButton.addEventListener("click", resetPerspective);
elements.resetCurrentButton.addEventListener("click", resetCurrentMockup);
elements.replaceSourceButton.addEventListener("click", toggleSourcePopover);
elements.screenCta.addEventListener("click", toggleSourcePopover);
elements.quickReadSelectionButton.addEventListener("click", requestSelection);
elements.quickImportFileButton.addEventListener("click", () => {
  closeSourcePopover();
  elements.imageInput.click();
});
elements.quickClearDesignButton.addEventListener("click", clearDesign);
document.addEventListener("pointerdown", (event) => {
  if (elements.sourcePopover.hidden) return;
  if (elements.sourcePopover.contains(event.target) || elements.replaceSourceButton.contains(event.target) || elements.screenCta.contains(event.target)) return;
  closeSourcePopover();
});
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
updateSourceActions();
enableDesignEditing();
enablePerspectiveEditing();
enableStageNavigation();
enableWindowResize();

window.onmessage = async (event) => {
  const message = event.data.pluginMessage;
  if (!message || typeof message.type !== "string") return;

  if (message.type === "selection-state") {
    state.selection = message.selection;
    elements.selectionText.textContent = message.selection.message;
    elements.selectionChip.classList.toggle("ready", Boolean(message.selection.available));
    elements.readSelectionButton.disabled = !message.selection.available;
    updateSourceActions();
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
    elements.quickReadSelectionButton.disabled = false;
    elements.readSelectionButton.textContent = "重新读取 Figma 选区";
    await setDesignBytes(message.bytes, message.name, "image/png", { type: message.sourceType || "Figma 选区" });
    showToast(`已放入：${message.name}`);
    return;
  }

  if (message.type === "selection-composite") {
    elements.readSelectionButton.disabled = false;
    elements.quickReadSelectionButton.disabled = false;
    elements.readSelectionButton.textContent = "重新读取 Figma 选区";
    await composeSelectionLayers(message);
    showToast(`已整体放入：${message.name}`);
    return;
  }

  if (message.type === "selection-error") {
    elements.readSelectionButton.disabled = false;
    updateSourceActions();
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

window.addEventListener("beforeunload", () => {
  if (pdfWorkerUrl) URL.revokeObjectURL(pdfWorkerUrl);
  if (state.designObjectUrl) URL.revokeObjectURL(state.designObjectUrl);
});

void PRODUCTION_CATALOG_URL;
