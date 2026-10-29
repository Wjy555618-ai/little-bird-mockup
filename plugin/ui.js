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
  cropShade: document.querySelector("#cropShade"),
  cropFrame: document.querySelector("#cropFrame"),
  designDragTarget: document.querySelector("#designDragTarget"),
  perspectiveStatus: document.querySelector("#perspectiveStatus"),
  cropToolbar: document.querySelector("#cropToolbar"),
  cropCancelButton: document.querySelector("#cropCancelButton"),
  cropDoneButton: document.querySelector("#cropDoneButton"),
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
const DEFAULT_CROP = renderer.DEFAULT_CROP;

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
  cropMode: false,
  cropSnapshot: null,
  cropHistoryDepth: 0,
  rendering: false,
  pluginCatalogCache: null,
  customQuad: null,
  contentFrame: null,
  imageFrame: null,
  designName: "",
  adjustments: { ...DEFAULT_ADJUSTMENTS },
  crop: { ...DEFAULT_CROP },
  history: [],
  future: []
};

function cloneQuad(quad) {
  return quad?.map((point) => [...point]) || null;
}

function editorSnapshot() {
  return {
    adjustments: { ...state.adjustments },
    crop: { ...state.crop },
    customQuad: cloneQuad(state.customQuad),
    contentFrame: state.contentFrame ? { ...state.contentFrame } : null,
    imageFrame: state.imageFrame ? { ...state.imageFrame } : null,
    fit: elements.fitMode.value,
    designImage: state.designImage,
    designObjectUrl: state.designObjectUrl,
    designName: state.designName,
    designSource: state.designSource ? { ...state.designSource } : null
  };
}

function snapshotSignature(snapshot) {
  return JSON.stringify({
    adjustments: snapshot.adjustments,
    crop: snapshot.crop,
    customQuad: snapshot.customQuad,
    contentFrame: snapshot.contentFrame,
    imageFrame: snapshot.imageFrame,
    fit: snapshot.fit,
    designName: snapshot.designName,
    designSource: snapshot.designSource
  });
}

function pushHistory() {
  const snapshot = editorSnapshot();
  const previous = state.history.at(-1);
  if (!previous || previous.designImage !== snapshot.designImage || snapshotSignature(previous) !== snapshotSignature(snapshot)) {
    state.history.push(snapshot);
    if (state.history.length > 60) state.history.shift();
  }
  state.future = [];
}

function restoreEditorSnapshot(snapshot) {
  if (!snapshot) return;
  state.adjustments = { ...snapshot.adjustments };
  state.crop = { ...DEFAULT_CROP, ...(snapshot.crop || {}) };
  state.customQuad = cloneQuad(snapshot.customQuad);
  state.contentFrame = snapshot.contentFrame ? { ...snapshot.contentFrame } : null;
  state.imageFrame = snapshot.imageFrame ? { ...snapshot.imageFrame } : null;
  state.designImage = snapshot.designImage;
  state.designObjectUrl = snapshot.designObjectUrl;
  state.designName = snapshot.designName;
  state.designSource = snapshot.designSource ? { ...snapshot.designSource } : null;
  elements.fitMode.value = "cover";
  state.cropMode = false;
  state.cropSnapshot = null;
  state.cropHistoryDepth = 0;
  state.designSelected = false;
  syncAdjustmentControls();
  elements.designSourceLabel.textContent = state.designName || "尚未读取画面";
  elements.clearDesignButton.disabled = !state.designImage;
  updateSourceActions();
  updateSourceGuide();
  updateOutputAvailability();
  renderFinalComposite();
}

function undoEditor() {
  const snapshot = state.history.pop();
  if (!snapshot) return;
  state.future.push(editorSnapshot());
  restoreEditorSnapshot(snapshot);
  showToast("已撤回上一步");
}

function redoEditor() {
  const snapshot = state.future.pop();
  if (!snapshot) return;
  state.history.push(editorSnapshot());
  restoreEditorSnapshot(snapshot);
  showToast("已重做");
}

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
  const next = [id, ...recentIds().filter((value) => value !== id)].slice(0, 10);
  safeStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

function renderRecentStrip() {
  if (!state.manifest) return;
  const items = recentIds()
    .map((id) => state.manifest.items.find((item) => item.id === id))
    .filter(Boolean)
    .slice(0, 10);
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

function enableRecentScrolling() {
  let drag = null;
  elements.recentItems.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    drag = { x: event.clientX, left: elements.recentItems.scrollLeft, moved: false };
    elements.recentItems.setPointerCapture(event.pointerId);
  });
  elements.recentItems.addEventListener("pointermove", (event) => {
    if (!drag || !elements.recentItems.hasPointerCapture(event.pointerId)) return;
    const delta = event.clientX - drag.x;
    if (Math.abs(delta) > 4) drag.moved = true;
    elements.recentItems.scrollLeft = drag.left - delta;
  });
  elements.recentItems.addEventListener("click", (event) => {
    if (!drag?.moved) return;
    event.preventDefault();
    event.stopPropagation();
  }, true);
  const finish = (event) => {
    if (elements.recentItems.hasPointerCapture(event.pointerId)) elements.recentItems.releasePointerCapture(event.pointerId);
    requestAnimationFrame(() => { drag = null; });
  };
  elements.recentItems.addEventListener("pointerup", finish);
  elements.recentItems.addEventListener("pointercancel", finish);
  elements.recentItems.addEventListener("wheel", (event) => {
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    elements.recentItems.scrollLeft += event.deltaY;
    event.preventDefault();
  }, { passive: false });
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
  let hash = 2166136261;
  for (const character of id) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 15;
  return (hash >>> 0) % 2 === 0 ? -4 : 4;
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

  let previousTilt = 0;
  let repeatedTilt = 0;
  for (const item of items) {
    let tilt = hoverTiltFor(item.id);
    if (tilt === previousTilt && repeatedTilt >= 2) tilt *= -1;
    repeatedTilt = tilt === previousTilt ? repeatedTilt + 1 : 1;
    previousTilt = tilt;
    const button = document.createElement("button");
    button.className = `asset-card${state.selectedAsset?.id === item.id ? " active" : ""}`;
    button.dataset.assetId = item.id;
    button.style.setProperty("--hover-tilt", `${tilt}deg`);

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
    state.crop = { ...DEFAULT_CROP };
    state.contentFrame = null;
    state.imageFrame = null;
    if (state.designImage) resetContentGeometry();
    state.designSelected = false;
    state.cropMode = false;
    state.cropSnapshot = null;
    state.history = [];
    state.future = [];
  }
  closeSourcePopover();
  rememberRecent(id);
  elements.fitMode.value = "cover";
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

function screenQuad() {
  return state.selectedAsset?.screen.quad || null;
}

function updateSourceGuide() {
  const recommended = state.selectedAsset?.screen?.recommendedSize;
  elements.sourceGuide.classList.remove("match", "mismatch");
  if (!recommended) {
    elements.recommendedSize.textContent = "选择样机后显示";
    elements.recommendedRatio.textContent = "先选择一个样机";
    elements.sourceMatch.textContent = "";
    return;
  }
  elements.recommendedSize.textContent = `${recommended.width} × ${recommended.height} px`;
  elements.recommendedRatio.textContent = `${recommended.label} · 保持原比例`;
  if (!state.designSource) {
    elements.sourceMatch.textContent = "导入后默认显示完成效果";
    return;
  }
  const expectedAspect = recommended.width / recommended.height;
  const sourceAspect = state.designSource.width / state.designSource.height;
  const matches = Math.abs(sourceAspect / expectedAspect - 1) <= 0.03;
  elements.sourceGuide.classList.add(matches ? "match" : "mismatch");
  const sourceLabel = `${state.designSource.width} × ${state.designSource.height} px · ${state.designSource.type}`;
  elements.sourceMatch.textContent = matches
    ? `${sourceLabel} · 比例匹配`
    : `${sourceLabel} · 比例不同，已自动裁切填满`;
}

function screenPlane() {
  const recommended = state.selectedAsset?.screen?.recommendedSize;
  return renderer.screenPlane(recommended ? recommended.width / recommended.height : 1);
}

function fixedApertureFrame() {
  const plane = screenPlane();
  return { cx: plane.width / 2, cy: plane.height / 2, width: plane.width, height: plane.height, rotation: 0 };
}

function resetContentGeometry() {
  const frame = fixedApertureFrame();
  state.contentFrame = { ...frame };
  state.imageFrame = state.designImage ? renderer.imageFrameForCover(state.designImage, frame) : { ...frame };
}

function ensureContentGeometry() {
  if (!state.selectedAsset || !state.designImage) return null;
  const plane = screenPlane();
  // The asset owns the aperture. It must never move or resize with the source;
  // otherwise the rendered pixels and the visible device screen inevitably
  // separate after a drag, resize or crop operation.
  state.contentFrame = fixedApertureFrame();
  state.imageFrame = renderer.constrainImageFrameToCover(
    state.designImage,
    renderer.normalizeFrame(state.imageFrame, plane.width, plane.height),
    state.contentFrame
  );
  return { plane, frame: state.contentFrame, imageFrame: state.imageFrame };
}

function planePointToCanvas(point) {
  const plane = screenPlane();
  return renderer.bilinearPoint(activeQuad(), point[0] / plane.width, point[1] / plane.height);
}

function frameCanvasPoints(frame = state.contentFrame) {
  if (!frame) return [];
  const recommended = state.selectedAsset?.screen?.recommendedSize;
  const targetAspect = recommended ? recommended.width / recommended.height : 1;
  // This is the same projection used by renderComposite. The editor must not
  // derive a second rectangle from the hidden, oversized source bitmap.
  return renderer.frameQuadOnSurface(frame, targetAspect, activeQuad());
}

function designControlPoints() {
  if (!ensureContentGeometry()) return [];
  if (state.mode === "perspective" && !state.cropMode) return cloneQuad(activeQuad());
  // The visible aperture is the editing boundary. imageFrame can extend past
  // it for cover/crop, but those hidden pixels must never move the handles.
  return frameCanvasPoints(state.contentFrame);
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

function roundedFramePath(frame, radiusRatio = 0) {
  if (!frame) return "";
  const radius = Math.max(0, Math.min(frame.width, frame.height) * Math.min(0.49, radiusRatio));
  const localPoint = (x, y) => {
    const angle = frame.rotation * Math.PI / 180;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    return planePointToCanvas([frame.cx + x * cosine - y * sine, frame.cy + x * sine + y * cosine]);
  };
  const left = -frame.width / 2;
  const right = frame.width / 2;
  const top = -frame.height / 2;
  const bottom = frame.height / 2;
  const point = (value) => `${value[0]} ${value[1]}`;
  const p0 = localPoint(left + radius, top);
  const p1 = localPoint(right - radius, top);
  const c1 = localPoint(right, top);
  const p2 = localPoint(right, top + radius);
  const p3 = localPoint(right, bottom - radius);
  const c2 = localPoint(right, bottom);
  const p4 = localPoint(right - radius, bottom);
  const p5 = localPoint(left + radius, bottom);
  const c3 = localPoint(left, bottom);
  const p6 = localPoint(left, bottom - radius);
  const p7 = localPoint(left, top + radius);
  const c4 = localPoint(left, top);
  return `M${point(p0)}L${point(p1)}Q${point(c1)} ${point(p2)}L${point(p3)}Q${point(c2)} ${point(p4)}L${point(p5)}Q${point(c3)} ${point(p6)}L${point(p7)}Q${point(c4)} ${point(p0)}Z`;
}

function updateDesignEditor() {
  const points = designControlPoints();
  const visible = points.length === 4;
  elements.designEditor.hidden = !visible;
  elements.cropToolbar.hidden = !state.cropMode;
  if (!visible) return;
  elements.designEditor.classList.toggle("is-selected", state.designSelected);
  elements.designEditor.classList.toggle("is-cropping", state.cropMode);
  elements.designEditor.classList.toggle("is-perspective", state.mode === "perspective");
  const pointString = points.map((point) => point.join(",")).join(" ");
  elements.designPolygon.setAttribute("points", pointString);
  elements.designDragTarget.setAttribute("points", pointString);
  const svg = elements.designPolygon.ownerSVGElement;
  svg.setAttribute("viewBox", `0 0 ${state.selectedAsset.canvas.width} ${state.selectedAsset.canvas.height}`);
  const cornerRadius = state.selectedAsset.screen.cornerRadius || 0;
  elements.cropFrame.setAttribute("d", roundedFramePath(state.contentFrame, cornerRadius));
  elements.cropShade.setAttribute(
    "d",
    `M0 0H${state.selectedAsset.canvas.width}V${state.selectedAsset.canvas.height}H0Z ${roundedFramePath(state.contentFrame, cornerRadius)}`
  );
  const handlePoints = designHandlePoints(points);
  for (const handle of elements.designEditor.querySelectorAll(".design-scale-handle")) {
    const point = handlePoints[handle.dataset.handle];
    handle.style.left = `${point[0] / state.selectedAsset.canvas.width * 100}%`;
    handle.style.top = `${point[1] / state.selectedAsset.canvas.height * 100}%`;
  }
}

function pointOnCanvas(event) {
  const rect = elements.previewCanvas.getBoundingClientRect();
  return [
    (event.clientX - rect.left) / rect.width * state.selectedAsset.canvas.width,
    (event.clientY - rect.top) / rect.height * state.selectedAsset.canvas.height
  ];
}

function pointOnScreenPlane(event) {
  const point = pointOnCanvas(event);
  const [u, v] = renderer.inverseBilinearPoint(activeQuad(), point);
  const plane = screenPlane();
  return [u * plane.width, v * plane.height];
}

function commitDirectAdjustment() {
  syncAdjustmentControls();
  updateDesignEditor();
  scheduleComposite("preview");
}

function enterCropMode() {
  if (!state.designImage || state.cropMode) return;
  state.cropSnapshot = editorSnapshot();
  state.cropHistoryDepth = state.history.length;
  state.cropMode = true;
  state.designSelected = true;
  updateDesignEditor();
}

function finishCropMode(commit = true) {
  if (!state.cropMode) return;
  const snapshot = state.cropSnapshot;
  const historyDepth = state.cropHistoryDepth;
  state.cropMode = false;
  state.cropSnapshot = null;
  state.cropHistoryDepth = 0;
  if (!commit && snapshot) {
    state.history.length = historyDepth;
    state.future = [];
    state.adjustments = { ...snapshot.adjustments };
    state.crop = { ...DEFAULT_CROP, ...(snapshot.crop || {}) };
    state.customQuad = cloneQuad(snapshot.customQuad);
    state.contentFrame = snapshot.contentFrame ? { ...snapshot.contentFrame } : null;
    state.imageFrame = snapshot.imageFrame ? { ...snapshot.imageFrame } : null;
    elements.fitMode.value = "cover";
    syncAdjustmentControls();
    renderFinalComposite();
  } else {
    updateDesignEditor();
    renderFinalComposite();
  }
}

function localPoint(point, frame) {
  const angle = -frame.rotation * Math.PI / 180;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const dx = point[0] - frame.cx;
  const dy = point[1] - frame.cy;
  return [dx * cosine - dy * sine, dx * sine + dy * cosine];
}

function resizeImageFromApertureHandle(startImageFrame, apertureFrame, handleName, startPointer, pointer) {
  const startLocal = localPoint(startPointer, apertureFrame);
  const nextLocal = localPoint(pointer, apertureFrame);
  const directionX = handleName.includes("w") ? -1 : handleName.includes("e") ? 1 : 0;
  const directionY = handleName.includes("n") ? -1 : handleName.includes("s") ? 1 : 0;
  const deltaX = (nextLocal[0] - startLocal[0]) * directionX;
  const deltaY = (nextLocal[1] - startLocal[1]) * directionY;
  const ratioX = Math.max(0.05, Math.min(8, 1 + deltaX / Math.max(1, apertureFrame.width)));
  const ratioY = Math.max(0.05, Math.min(8, 1 + deltaY / Math.max(1, apertureFrame.height)));
  const isCorner = handleName.length === 2;
  const cornerRatio = Math.max(ratioX, ratioY);
  return {
    ...startImageFrame,
    width: Math.max(20, startImageFrame.width * (isCorner ? cornerRatio : directionX ? ratioX : 1)),
    height: Math.max(20, startImageFrame.height * (isCorner ? cornerRatio : directionY ? ratioY : 1))
  };
}

function syncAdjustmentsFromFrame() {
  const geometry = ensureContentGeometry();
  if (!geometry) return;
  const { plane, frame, imageFrame } = geometry;
  const defaultImageFrame = renderer.imageFrameForCover(state.designImage, frame);
  state.adjustments = {
    ...state.adjustments,
    scale: Math.sqrt(imageFrame.width / defaultImageFrame.width * imageFrame.height / defaultImageFrame.height),
    offsetX: (imageFrame.cx - plane.width / 2) / (plane.width * 0.42),
    offsetY: (imageFrame.cy - plane.height / 2) / (plane.height * 0.42),
    rotation: imageFrame.rotation
  };
}

function enableDesignEditing() {
  let interaction = null;
  const warpHandles = { nw: [0], n: [0, 1], ne: [1], e: [1, 2], se: [2], s: [3, 2], sw: [3], w: [0, 3] };
  const start = (event, type) => {
    if (!state.designImage || !state.selectedAsset) return;
    ensureContentGeometry();
    const handleName = event.currentTarget.dataset.handle;
    state.designSelected = true;
    updateDesignEditor();
    interaction = {
      pointerId: event.pointerId,
      target: event.currentTarget,
      type,
      handleName,
      freeTransform: !state.cropMode && type === "scale" && (state.mode === "perspective" || event.metaKey || event.ctrlKey),
      startQuad: cloneQuad(activeQuad()),
      apertureFrame: { ...state.contentFrame },
      startImageFrame: { ...state.imageFrame },
      startPointerPlane: pointOnScreenPlane(event),
      startPointerCanvas: pointOnCanvas(event),
      changed: false,
      historyPushed: false
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  };
  const move = (event) => {
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    const pointerPlane = pointOnScreenPlane(event);
    const pointerCanvas = pointOnCanvas(event);
    const dx = pointerPlane[0] - interaction.startPointerPlane[0];
    const dy = pointerPlane[1] - interaction.startPointerPlane[1];
    if (!interaction.changed && Math.hypot(dx, dy) < 1.5) return;
    interaction.changed = true;
    if (!interaction.historyPushed) {
      pushHistory();
      interaction.historyPushed = true;
    }
    if (interaction.type === "move") {
      state.imageFrame = renderer.constrainImageFrameToCover(
        state.designImage,
        { ...interaction.startImageFrame, cx: interaction.startImageFrame.cx + dx, cy: interaction.startImageFrame.cy + dy },
        interaction.apertureFrame
      );
    } else if (interaction.freeTransform) {
      const canvas = state.selectedAsset.canvas;
      const nextQuad = cloneQuad(interaction.startQuad);
      const canvasDx = pointerCanvas[0] - interaction.startPointerCanvas[0];
      const canvasDy = pointerCanvas[1] - interaction.startPointerCanvas[1];
      for (const index of warpHandles[interaction.handleName]) {
        nextQuad[index] = [
          Math.max(0, Math.min(canvas.width, interaction.startQuad[index][0] + canvasDx)),
          Math.max(0, Math.min(canvas.height, interaction.startQuad[index][1] + canvasDy))
        ];
      }
      state.customQuad = nextQuad;
    } else {
      const nextImageFrame = resizeImageFromApertureHandle(
        interaction.startImageFrame,
        interaction.apertureFrame,
        interaction.handleName,
        interaction.startPointerPlane,
        pointerPlane
      );
      state.imageFrame = renderer.constrainImageFrameToCover(state.designImage, nextImageFrame, interaction.apertureFrame);
    }
    syncAdjustmentsFromFrame();
    commitDirectAdjustment();
    event.preventDefault();
  };
  const end = (event) => {
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    if (interaction.target.hasPointerCapture(event.pointerId)) interaction.target.releasePointerCapture(event.pointerId);
    const changed = interaction?.changed;
    interaction = null;
    if (changed) renderFinalComposite();
    else updateDesignEditor();
    event.stopPropagation();
  };
  elements.designDragTarget.addEventListener("pointerdown", (event) => start(event, "move"));
  window.addEventListener("pointermove", move, { passive: false });
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
  elements.designDragTarget.addEventListener("dblclick", (event) => {
    enterCropMode();
    event.preventDefault();
    event.stopPropagation();
  });
  elements.designDragTarget.addEventListener("keydown", (event) => {
    const step = event.shiftKey ? 10 : 1;
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    pushHistory();
    const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
    const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
    state.imageFrame = renderer.constrainImageFrameToCover(
      state.designImage,
      { ...state.imageFrame, cx: state.imageFrame.cx + dx, cy: state.imageFrame.cy + dy },
      state.contentFrame
    );
    syncAdjustmentsFromFrame();
    commitDirectAdjustment();
    renderFinalComposite();
    event.preventDefault();
  });
  for (const handle of elements.designEditor.querySelectorAll(".design-scale-handle")) {
    handle.addEventListener("pointerdown", (event) => start(event, "scale"));
    handle.addEventListener("keydown", (event) => {
      if (!["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"].includes(event.key)) return;
      pushHistory();
      const direction = ["ArrowUp", "ArrowRight"].includes(event.key) ? 1 : -1;
      const factor = 1 + direction * (event.shiftKey ? 0.1 : 0.02);
      const nextFrame = {
        ...state.imageFrame,
        width: Math.max(20, state.imageFrame.width * factor),
        height: Math.max(20, state.imageFrame.height * factor)
      };
      state.imageFrame = renderer.constrainImageFrameToCover(state.designImage, nextFrame, state.contentFrame);
      syncAdjustmentsFromFrame();
      commitDirectAdjustment();
      renderFinalComposite();
      event.preventDefault();
    });
  }
  elements.cropCancelButton.addEventListener("click", () => finishCropMode(false));
  elements.cropDoneButton.addEventListener("click", () => finishCropMode(true));
}

let scheduledRenderFrame = 0;
let scheduledRenderQuality = "preview";

function renderComposite(quality = "final") {
  if (!state.selectedAsset || !state.baseImage) return;
  if (state.designImage) ensureContentGeometry();
  renderer.renderComposite({
    canvas: elements.previewCanvas,
    asset: state.selectedAsset,
    baseImage: state.baseImage,
    designImage: state.designImage,
    fit: "cover",
    adjustments: state.adjustments,
    crop: state.crop,
    content: state.designImage ? { frame: state.contentFrame, imageFrame: state.imageFrame } : null,
    quad: screenQuad(),
    designQuad: activeQuad(),
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
  const original = state.selectedAsset.screen.quad;
  const unchanged = quad.every((point, index) => point.every((value, axis) => Math.abs(value - original[index][axis]) < 0.5));
  elements.perspectiveStatus.textContent = unchanged ? "默认透视" : "已调整";
}

function setMode(mode) {
  state.mode = mode;
  closeSourcePopover();
  document.querySelectorAll(".mode-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.mode === mode));
  elements.catalogView.hidden = mode !== "catalog";
  elements.adjustPanel.hidden = mode === "catalog";
  elements.adjustControls.hidden = mode !== "adjust";
  elements.perspectiveControls.hidden = mode !== "perspective";
  elements.designEditor.hidden = !state.designImage;
  elements.adjustPanelTitle.textContent = mode === "perspective" ? "透视编辑" : "画面调整";
  elements.stageTitle.textContent = mode === "perspective" ? "自由透视" : mode === "adjust" ? "画面调整" : "预览";
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
  const nextAdjustments = {
    scale: Number(elements.designScale.value) / 100,
    offsetX: Number(elements.designOffsetX.value) / 100,
    offsetY: Number(elements.designOffsetY.value) / 100,
    rotation: Number(elements.designRotation.value),
    brightness: Number(elements.designBrightness.value) / 100,
    contrast: Number(elements.designContrast.value) / 100,
    saturation: Number(elements.designSaturation.value) / 100
  };
  if (state.designImage && ensureContentGeometry()) {
    const plane = screenPlane();
    const startFrame = { ...state.imageFrame };
    const currentScale = Math.max(0.01, state.adjustments.scale || 1);
    const ratio = nextAdjustments.scale / currentScale;
    const nextImageFrame = {
      cx: plane.width / 2 + nextAdjustments.offsetX * plane.width * 0.42,
      cy: plane.height / 2 + nextAdjustments.offsetY * plane.height * 0.42,
      width: Math.max(20, startFrame.width * ratio),
      height: Math.max(20, startFrame.height * ratio),
      rotation: nextAdjustments.rotation
    };
    state.imageFrame = renderer.constrainImageFrameToCover(state.designImage, nextImageFrame, state.contentFrame);
  }
  state.adjustments = nextAdjustments;
  syncAdjustmentControls();
  updateDesignEditor();
  scheduleComposite("preview");
}

async function setDesignBytes(bytes, name, mimeType = "image/png", metadata = {}) {
  pushHistory();
  state.designObjectUrl = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  state.designImage = await loadImage(state.designObjectUrl);
  state.designName = name;
  state.designSource = {
    width: Math.round(metadata.width || state.designImage.naturalWidth || state.designImage.width),
    height: Math.round(metadata.height || state.designImage.naturalHeight || state.designImage.height),
    type: metadata.type || "图片"
  };
  state.designSelected = false;
  state.cropMode = false;
  state.cropSnapshot = null;
  state.adjustments = { ...DEFAULT_ADJUSTMENTS };
  state.crop = { ...DEFAULT_CROP };
  resetContentGeometry();
  elements.fitMode.value = "cover";
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
  if (state.designImage) pushHistory();
  state.designObjectUrl = null;
  state.designImage = null;
  state.designName = "";
  state.designSource = null;
  state.designSelected = false;
  state.cropMode = false;
  state.cropSnapshot = null;
  state.contentFrame = null;
  state.imageFrame = null;
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
  pushHistory();
  state.adjustments = { ...DEFAULT_ADJUSTMENTS };
  state.crop = { ...DEFAULT_CROP };
  if (state.designImage) resetContentGeometry();
  elements.fitMode.value = "cover";
  syncAdjustmentControls();
  renderFinalComposite();
  showToast("画面调整已恢复默认");
}

function resetPerspective() {
  if (!state.selectedAsset) return;
  pushHistory();
  state.customQuad = state.selectedAsset.screen.quad.map((point) => [...point]);
  if (state.designImage) resetContentGeometry();
  renderFinalComposite();
  showToast("样机透视已恢复默认");
}

function resetCurrentMockup() {
  if (!state.selectedAsset) return;
  pushHistory();
  state.adjustments = { ...DEFAULT_ADJUSTMENTS };
  state.crop = { ...DEFAULT_CROP };
  state.customQuad = state.selectedAsset.screen.quad.map((point) => [...point]);
  // A global reset must restore the content geometry as well as colour and
  // perspective settings. Leaving the edited crop frame in place made the
  // source appear as a small or offset rectangle even after “复位”.
  if (state.designImage) resetContentGeometry();
  elements.fitMode.value = "cover";
  state.designSelected = false;
  state.cropMode = false;
  state.cropSnapshot = null;
  syncAdjustmentControls();
  fitStage();
  renderFinalComposite();
  showToast("已恢复默认画面");
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

function sizeCanvasWrap() {
  const stageRect = elements.stage.getBoundingClientRect();
  const canvasWidth = elements.previewCanvas.width || 1;
  const canvasHeight = elements.previewCanvas.height || 1;
  const aspect = canvasWidth / canvasHeight;
  const availableWidth = Math.max(1, stageRect.width - 32);
  const availableHeight = Math.max(1, stageRect.height - 32);
  const width = Math.max(1, Math.min(availableWidth, availableHeight * aspect));
  const height = Math.max(1, width / aspect);
  elements.canvasWrap.style.width = `${width}px`;
  elements.canvasWrap.style.height = `${height}px`;
}

function applyStageView() {
  clampStagePan();
  elements.canvasWrap.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
  elements.canvasWrap.style.setProperty("--overlay-inverse-scale", String(1 / state.zoom));
  elements.zoomReset.textContent = state.zoom === 1 && state.panX === 0 && state.panY === 0 ? "适应" : `${Math.round(state.zoom * 100)}%`;
}

function clampStagePan() {
  const stageRect = elements.stage.getBoundingClientRect();
  const width = elements.canvasWrap.offsetWidth * state.zoom;
  const height = elements.canvasWrap.offsetHeight * state.zoom;
  if (!stageRect.width || !stageRect.height || !width || !height) return;
  const minimumVisible = 0.11;
  const maxX = Math.max(0, stageRect.width / 2 + width / 2 - width * minimumVisible);
  const maxY = Math.max(0, stageRect.height / 2 + height / 2 - height * minimumVisible);
  state.panX = Math.max(-maxX, Math.min(maxX, state.panX));
  state.panY = Math.max(-maxY, Math.min(maxY, state.panY));
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
  sizeCanvasWrap();
  state.zoom = 1;
  state.panX = 0;
  state.panY = 0;
  applyStageView();
}

function enableStageNavigation() {
  let interaction = null;
  let spacePressed = false;

  window.addEventListener("keydown", (event) => {
    const editable = /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || "");
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && !editable) {
      if (event.shiftKey) redoEditor();
      else undoEditor();
      event.preventDefault();
      return;
    }
    if (event.code === "Space" && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement?.tagName || "")) {
      spacePressed = true;
      event.preventDefault();
    }
    if (event.key === "Escape") {
      closeSourcePopover();
      if (state.cropMode) finishCropMode(false);
      else state.designSelected = false;
      updateDesignEditor();
    }
    if (event.key === "Enter" && state.cropMode && !editable) {
      finishCropMode(true);
      event.preventDefault();
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
    const overInteractive = event.target.closest("button, .design-drag-target, .design-scale-handle, .source-popover, .crop-toolbar");
    const canPan = event.button === 1 || spacePressed || (!overInteractive && event.button === 0);
    if (!canPan) return;
    if (!overInteractive && state.designSelected) {
      if (state.cropMode) finishCropMode(true);
      state.designSelected = false;
      updateDesignEditor();
    }
    interaction = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, panX: state.panX, panY: state.panY };
    elements.stage.classList.add("is-panning");
    event.preventDefault();
  });

  // Figma's plugin webview can drop element-level pointer capture when the
  // pointer crosses the transformed canvas. Window-level listeners keep pan
  // continuous in both the browser harness and the real host.
  window.addEventListener("pointermove", (event) => {
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    state.panX = interaction.panX + event.clientX - interaction.x;
    state.panY = interaction.panY + event.clientY - interaction.y;
    applyStageView();
    event.preventDefault();
  }, { passive: false });

  const finishPan = (event) => {
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    interaction = null;
    elements.stage.classList.remove("is-panning");
  };
  window.addEventListener("pointerup", finishPan);
  window.addEventListener("pointercancel", finishPan);
  window.addEventListener("resize", () => {
    sizeCanvasWrap();
    applyStageView();
  });
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
  control.addEventListener("pointerdown", pushHistory);
  control.addEventListener("keydown", (event) => {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key)) pushHistory();
  });
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
enableStageNavigation();
enableRecentScrolling();
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
