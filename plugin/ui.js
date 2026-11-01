const PLUGIN_VERSION = "__PLUGIN_VERSION__";
const BUILD_FINGERPRINT = "__BUILD_FINGERPRINT__";
const BUILD_MODE = "__BUILD_MODE__";
const ACTIVE_CATALOG_URL = "__CATALOG_URL__";
const EXPECTED_CATALOG_ENVIRONMENT = "__CATALOG_ENVIRONMENT__";
const EXPECTED_CATALOG_SCHEMA_VERSION = __CATALOG_SCHEMA_VERSION__;
const EXPECTED_RENDERER_VERSION = "__RENDERER_VERSION__";
const MAX_OFFLINE_CATALOG_AGE_MS = __MAX_OFFLINE_AGE_HOURS__ * 60 * 60 * 1000;
const MAX_CATALOG_ITEMS = __MAX_CATALOG_ITEMS__;
const MAX_CATALOG_MANIFEST_BYTES = __MAX_CATALOG_MANIFEST_BYTES__;
const MAX_CATALOG_ASSET_BYTES = __MAX_CATALOG_ASSET_BYTES__;
const MAX_LOCAL_FILE_BYTES = __MAX_LOCAL_FILE_BYTES__;
document.documentElement.dataset.buildFingerprint = BUILD_FINGERPRINT;
document.documentElement.dataset.pluginVersion = PLUGIN_VERSION;
const renderer = window.MockupRenderer;
const catalogContract = window.MockupCatalogContract;
const resourceLimits = window.MockupResourceLimits;
const boundedResponse = window.MockupBoundedResponse;
const assetCardHover = window.MockupAssetCardHover;
const userErrors = window.MockupUserErrors;
const USER_ERROR_CODES = userErrors.CODES;
const pdfjs = window.pdfjsLib;
const CATALOG_CACHE_KEY = "__CATALOG_CACHE_KEY__";
const RECENT_KEY = "mockup-studio-recent-v1";
const CONTENT_TRANSITION_MS = 280;
const STAGE_VIEW_MOTION_MS = 360;
const MAX_PREVIEW_RENDER_SCALE = 2;
const HIGH_RES_PREVIEW_ZOOM = 1.4;
const PREVIEW_RESOLUTION_SETTLE_MS = 140;
const CONTENT_DOUBLE_CLICK_MS = 480;
const CONTENT_DOUBLE_CLICK_DISTANCE = 8;
const memoryStorage = new Map();
const catalogImageCache = new Map();

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
  catalogState: document.querySelector("#catalogState"),
  refreshButton: document.querySelector("#refreshButton"),
  searchInput: document.querySelector("#searchInput"),
  clearSearch: document.querySelector("#clearSearch"),
  catalogSegments: document.querySelector("#catalogSegments"),
  categoryPicker: document.querySelector("#categoryPicker"),
  categorySelect: document.querySelector("#categorySelect"),
  categoryTrigger: document.querySelector("#categoryTrigger"),
  categoryLabel: document.querySelector("#categoryLabel"),
  categoryMenu: document.querySelector("#categoryMenu"),
  catalogCount: document.querySelector("#catalogCount"),
  locateCurrentAsset: document.querySelector("#locateCurrentAsset"),
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
  contentTransitionCanvas: document.querySelector("#contentTransitionCanvas"),
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
  appShell: document.querySelector("#appShell"),
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
  locatedAssetId: null,
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
    designSource: state.designSource ? { ...state.designSource } : null,
    designSelected: state.designSelected
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
    designSource: snapshot.designSource,
    designSelected: snapshot.designSelected
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
  elements.fitMode.value = snapshot.fit || "cover";
  state.cropMode = false;
  state.cropSnapshot = null;
  state.cropHistoryDepth = 0;
  state.designSelected = Boolean(snapshot.designSelected && snapshot.designImage);
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
  if (!snapshot) return false;
  state.future.push(editorSnapshot());
  restoreEditorSnapshot(snapshot);
  showToast("已撤回上一步");
  return true;
}

function redoEditor() {
  const snapshot = state.future.pop();
  if (!snapshot) return false;
  state.history.push(editorSnapshot());
  restoreEditorSnapshot(snapshot);
  showToast("已重做");
  return true;
}

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

let previewWindowCollapseProgress = 0;
let previewWindowTransitionRevision = 0;

function easeWindowProgress(progress) {
  return 1 - Math.pow(1 - progress, 3);
}

function previewWindowTransition(windowState) {
  const targetState = windowState === "collapsed" ? "collapsed" : "expanded";
  const targetProgress = targetState === "collapsed" ? 1 : 0;
  const startProgress = previewWindowCollapseProgress;
  const revision = ++previewWindowTransitionRevision;
  const startedAt = performance.now();

  function commitFrame() {
    if (revision !== previewWindowTransitionRevision) return;
    const progress = Math.min(1, (performance.now() - startedAt) / 240);
    previewWindowCollapseProgress = startProgress + (targetProgress - startProgress) * easeWindowProgress(progress);
    dispatchPreviewMessage({ type: "window-state-progress", state: targetState, progress: previewWindowCollapseProgress });
    if (progress < 1) {
      setTimeout(commitFrame, 16);
      return;
    }
    previewWindowCollapseProgress = targetProgress;
    dispatchPreviewMessage({ type: "window-state-applied", state: targetState });
  }

  commitFrame();
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
  if (message.type === "set-window-state") {
    previewWindowTransition(message.state);
  }
}

function setCatalogState(mode, label) {
  state.catalogMode = mode;
  elements.catalogState.className = `catalog-state ${mode}`;
  elements.catalogState.textContent = label;
  elements.catalogState.title = label;
  elements.catalogState.setAttribute("aria-label", label);
}

const reducedMotionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)") || { matches: false };
const visibilityTimers = new WeakMap();
const visibilityRevisions = new WeakMap();
const enterTimers = new WeakMap();

function waitForNextPaint() {
  if (reducedMotionQuery.matches) return Promise.resolve();
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function waitForDuration(duration) {
  if (duration <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, duration));
}

function setAnimatedVisibility(element, visible) {
  const revision = (visibilityRevisions.get(element) || 0) + 1;
  visibilityRevisions.set(element, revision);
  clearTimeout(visibilityTimers.get(element));
  visibilityTimers.delete(element);
  if (visible) {
    if (!element.hidden && element.classList.contains("is-visible")) return;
    element.hidden = false;
    element.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => {
      if (visibilityRevisions.get(element) === revision && !element.hidden) {
        element.classList.add("is-visible");
      }
    });
    return;
  }
  if (element.hidden && !element.classList.contains("is-visible")) return;
  element.classList.remove("is-visible");
  element.setAttribute("aria-hidden", "true");
  const timer = setTimeout(() => {
    if (visibilityRevisions.get(element) === revision) element.hidden = true;
    visibilityTimers.delete(element);
  }, reducedMotionQuery.matches ? 0 : 240);
  visibilityTimers.set(element, timer);
}

function replayEnter(element) {
  clearTimeout(enterTimers.get(element));
  element.classList.remove("is-entering");
  if (reducedMotionQuery.matches) return;
  void element.offsetWidth;
  element.classList.add("is-entering");
  const timer = setTimeout(() => {
    element.classList.remove("is-entering");
    enterTimers.delete(element);
  }, 260);
  enterTimers.set(element, timer);
}

function categoryOptions() {
  return [...elements.categoryMenu.querySelectorAll(".category-option")];
}

function closeCategoryMenu({ restoreFocus = false } = {}) {
  elements.categoryPicker.classList.remove("is-open");
  elements.categoryTrigger.setAttribute("aria-expanded", "false");
  setAnimatedVisibility(elements.categoryMenu, false);
  if (restoreFocus) elements.categoryTrigger.focus();
}

function openCategoryMenu({ focusSelected = false } = {}) {
  elements.categoryPicker.classList.add("is-open");
  elements.categoryTrigger.setAttribute("aria-expanded", "true");
  setAnimatedVisibility(elements.categoryMenu, true);
  if (focusSelected) {
    requestAnimationFrame(() => {
      const selected = categoryOptions().find((option) => option.getAttribute("aria-selected") === "true");
      (selected || categoryOptions()[0])?.focus();
    });
  }
}

function setCategory(value, { render = true, restoreFocus = false } = {}) {
  const option = categoryOptions().find((item) => item.dataset.value === value) || categoryOptions()[0];
  if (!option) return;
  const changed = elements.categorySelect.value !== option.dataset.value;
  if (changed) state.locatedAssetId = null;
  elements.categorySelect.value = option.dataset.value;
  elements.categoryLabel.textContent = option.textContent;
  for (const item of categoryOptions()) {
    item.setAttribute("aria-selected", String(item === option));
  }
  closeCategoryMenu({ restoreFocus });
  if (render && changed) renderAssetGrid({ animate: true });
}

function renderCategoryMenu(categories) {
  const entries = [{ id: "all", label: "全部分类" }, ...categories];
  const currentValue = entries.some((entry) => entry.id === elements.categorySelect.value)
    ? elements.categorySelect.value
    : "all";
  elements.categoryMenu.replaceChildren();
  for (const entry of entries) {
    const option = document.createElement("button");
    option.type = "button";
    option.tabIndex = -1;
    option.className = "category-option";
    option.dataset.value = entry.id;
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", String(entry.id === currentValue));
    option.textContent = entry.label;
    option.addEventListener("click", () => setCategory(entry.id, { restoreFocus: true }));
    elements.categoryMenu.appendChild(option);
  }
  setCategory(currentValue, { render: false });
}

function moveCategoryFocus(direction) {
  const options = categoryOptions();
  if (!options.length) return;
  const currentIndex = options.indexOf(document.activeElement);
  const nextIndex = currentIndex < 0
    ? (direction > 0 ? 0 : options.length - 1)
    : (currentIndex + direction + options.length) % options.length;
  options[nextIndex].focus();
}

let toastTimer;
function showToast(message, duration = 2600) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  setAnimatedVisibility(elements.toast, true);
  toastTimer = setTimeout(() => setAnimatedVisibility(elements.toast, false), duration);
}

function showFailure(context, error, fallbackCode) {
  userErrors.report(context, error, fallbackCode);
  showToast(userErrors.message(error, fallbackCode));
}

function withTimeout(promise, milliseconds) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(userErrors.create(USER_ERROR_CODES.REQUEST_TIMEOUT)), milliseconds))
  ]);
}

function validateManifest(manifest) {
  return catalogContract.validateManifest(manifest, {
    schemaVersion: EXPECTED_CATALOG_SCHEMA_VERSION,
    environment: EXPECTED_CATALOG_ENVIRONMENT,
    rendererVersion: EXPECTED_RENDERER_VERSION,
    pluginVersion: PLUGIN_VERSION,
    maxItems: MAX_CATALOG_ITEMS
  }, renderer.validateAsset);
}

function resolveAssetUrl(relativePath) {
  return new URL(relativePath, state.catalogBaseUrl).href;
}

function validateCachedCatalog(value) {
  if (!value || value.catalogBaseUrl !== ACTIVE_CATALOG_URL) throw new Error("离线目录来源与当前构建不匹配");
  const cachedAt = Date.parse(value.cachedAt);
  const cacheAge = Date.now() - cachedAt;
  if (!Number.isFinite(cachedAt) || cacheAge < -300_000 || cacheAge > MAX_OFFLINE_CATALOG_AGE_MS) throw new Error("离线目录已过期");
  return validateManifest(value.manifest);
}

async function fetchCatalog() {
  setCatalogState("loading", "连接素材库");
  try {
    const response = await withTimeout(fetch(ACTIVE_CATALOG_URL, { cache: "no-store" }), 4500);
    if (!response.ok) throw new Error(`素材库返回 ${response.status}`);
    const manifestBytes = await boundedResponse.readBoundedResponse(response, MAX_CATALOG_MANIFEST_BYTES, "素材目录");
    const manifest = validateManifest(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes)));
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
        state.manifest = validateCachedCatalog(value);
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
    elements.catalogEmpty.querySelector("strong").textContent = "素材库暂时不可用";
    elements.catalogEmpty.querySelector("span").textContent = BUILD_MODE === "development" ? "本地开发请运行 pnpm catalog" : "请检查网络后重试";
    showFailure("catalog-fetch", error, USER_ERROR_CODES.CATALOG_UNAVAILABLE);
  }
}

function hydrateCatalog() {
  const categories = state.manifest.categories || [];
  renderCategoryMenu(categories);
  renderAssetGrid({ animate: true });
  if (!state.selectedAsset && state.manifest.items[0]) {
    selectAsset(state.manifest.items[0].id).finally(scheduleCatalogPreload);
  } else {
    scheduleCatalogPreload();
  }
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
  elements.catalogView.classList.toggle("has-recent", items.length > 0);
  setAnimatedVisibility(elements.recentStrip, items.length > 0);
  for (const item of items) {
    const button = document.createElement("button");
    button.className = `recent-item${state.selectedAsset?.id === item.id ? " active" : ""}`;
    button.dataset.assetId = item.id;
    button.title = item.name;
    const image = document.createElement("img");
    image.src = resolveAssetUrl(item.thumbnail);
    image.alt = item.name;
    button.appendChild(image);
    elements.recentItems.appendChild(button);
  }
}

function enableRecentScrolling() {
  let drag = null;
  let suppressClick = false;
  elements.recentItems.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    drag = { pointerId: event.pointerId, x: event.clientX, left: elements.recentItems.scrollLeft, moved: false };
    suppressClick = false;
  });
  elements.recentItems.addEventListener("pointermove", (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const delta = event.clientX - drag.x;
    if (!drag.moved && Math.abs(delta) <= 4) return;
    if (!drag.moved) {
      drag.moved = true;
      suppressClick = true;
      elements.recentItems.setPointerCapture(event.pointerId);
    }
    elements.recentItems.scrollLeft = drag.left - delta;
  });
  elements.recentItems.addEventListener("click", (event) => {
    if (!suppressClick) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClick = false;
  }, true);
  const finish = (event) => {
    if (elements.recentItems.hasPointerCapture(event.pointerId)) elements.recentItems.releasePointerCapture(event.pointerId);
    drag = null;
  };
  elements.recentItems.addEventListener("pointerup", finish);
  elements.recentItems.addEventListener("pointercancel", (event) => {
    suppressClick = false;
    finish(event);
  });
  elements.recentItems.addEventListener("wheel", (event) => {
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    elements.recentItems.scrollLeft += event.deltaY;
    event.preventDefault();
  }, { passive: false });
}

const SEARCH_CONCEPTS = Object.freeze([
  { categories: ["display", "laptop"], terms: ["电脑", "计算机", "computer", "pc"] },
  { categories: ["display"], terms: ["显示器", "屏幕", "monitor", "display", "台式机", "工作站", "desktop", "workstation"] },
  { categories: ["laptop"], terms: ["笔记本", "笔电", "手提电脑", "laptop", "notebook", "macbook"] },
  { categories: ["phone"], terms: ["手机", "智能手机", "移动设备", "phone", "mobile", "iphone", "android"] }
]);

function normalizeCatalogSearchText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[·•/,_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function catalogQueryTokens(query) {
  return [...new Set(normalizeCatalogSearchText(query).split(" ").filter(Boolean))];
}

function itemMatchesCatalogQuery(item, queryTokens, categoryLabels) {
  if (!queryTokens.length) return true;
  const categoryLabel = categoryLabels.get(item.category) || "";
  const searchIndex = normalizeCatalogSearchText([
    item.name,
    item.id,
    item.category,
    categoryLabel,
    ...(item.tags || [])
  ].join(" "));

  return queryTokens.every((token) => {
    if (searchIndex.includes(token)) return true;
    if (token.length < 2) return false;
    return SEARCH_CONCEPTS.some((concept) => (
      concept.categories.includes(item.category)
      && concept.terms.some((term) => normalizeCatalogSearchText(term).includes(token))
    ));
  });
}

function filterCatalogItems({ items, categories, query, category, segment, selectedCategory }) {
  const categoryLabels = new Map((categories || []).map((entry) => [entry.id, entry.label]));
  const queryTokens = catalogQueryTokens(query);
  const explicitCategory = category && category !== "all" ? category : null;
  const requiredCategory = explicitCategory || (segment === "similar" ? selectedCategory : null);

  return items.filter((item) => {
    if (requiredCategory && item.category !== requiredCategory) return false;
    return itemMatchesCatalogQuery(item, queryTokens, categoryLabels);
  });
}

function filteredItems() {
  if (!state.manifest) return [];
  const category = elements.categorySelect.value;
  const items = filterCatalogItems({
    items: state.manifest.items,
    categories: state.manifest.categories,
    query: elements.searchInput.value,
    category,
    segment: state.segment,
    selectedCategory: state.selectedAsset?.category
  });
  const locatedIndex = items.findIndex((item) => item.id === state.locatedAssetId);
  if (locatedIndex > 0) items.unshift(...items.splice(locatedIndex, 1));
  return items;
}

function syncAssetSelection() {
  for (const button of elements.assetGrid.querySelectorAll(".asset-card")) {
    button.classList.toggle("active", button.dataset.assetId === state.selectedAsset?.id);
  }
  for (const button of elements.recentItems.querySelectorAll(".recent-item")) {
    button.classList.toggle("active", button.dataset.assetId === state.selectedAsset?.id);
  }
  elements.locateCurrentAsset.disabled = !state.selectedAsset;
}

function renderAssetGrid({ animate = false } = {}) {
  const items = filteredItems();
  elements.assetGrid.replaceChildren();
  elements.catalogCount.textContent = `${items.length} 个样机`;
  setAnimatedVisibility(elements.catalogEmpty, items.length === 0);
  if (!items.length) {
    const query = elements.searchInput.value.trim();
    const category = elements.categorySelect.value;
    const categoryLabel = state.manifest.categories.find((entry) => entry.id === category)?.label;
    elements.catalogEmpty.querySelector("strong").textContent = query
      ? (categoryLabel ? `“${categoryLabel}”中没有“${query}”` : `没有找到“${query}”`)
      : (state.segment === "similar" ? "暂无相似样机" : "该分类暂无样机");
    elements.catalogEmpty.querySelector("span").textContent = query
      ? (categoryLabel ? "清空搜索或选择其他分类" : "清空搜索或更换关键词")
      : "选择其他分类后再试";
  }

  for (const [index, item] of items.entries()) {
    const button = document.createElement("button");
    button.className = `asset-card${state.selectedAsset?.id === item.id ? " active" : ""}`;
    button.dataset.assetId = item.id;
    button.setAttribute("aria-label", item.name);
    if (animate) {
      button.classList.add("is-entering");
      button.style.setProperty("--card-order", String(Math.min(index, 5)));
      button.addEventListener("animationend", () => button.classList.remove("is-entering"), { once: true });
    }

    const visual = document.createElement("span");
    visual.className = "asset-card-visual";

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
    visual.append(image, footer);
    button.appendChild(visual);
    elements.assetGrid.appendChild(button);
  }
  renderRecentStrip();
}

function selectAssetFromCatalogEvent(event) {
  const button = event.target?.closest?.("[data-asset-id]");
  if (!button || !event.currentTarget.contains(button)) return;
  selectAsset(button.dataset.assetId);
}

function setCatalogSegment(filter, { render = true } = {}) {
  const nextFilter = filter === "similar" ? "similar" : "all";
  const changed = state.segment !== nextFilter;
  if (changed) state.locatedAssetId = null;
  state.segment = nextFilter;
  elements.catalogSegments.dataset.activeFilter = nextFilter;
  for (const item of document.querySelectorAll(".segment")) {
    const active = item.dataset.filter === nextFilter;
    item.classList.toggle("active", active);
    item.setAttribute("aria-selected", String(active));
  }
  if (render && changed) renderAssetGrid({ animate: true });
}

function locateSelectedAsset() {
  if (!state.selectedAsset) return;
  elements.searchInput.value = "";
  elements.clearSearch.hidden = true;
  setCategory("all", { render: false });
  setCatalogSegment("all", { render: false });
  state.locatedAssetId = state.selectedAsset.id;
  renderAssetGrid();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const card = [...elements.assetGrid.querySelectorAll(".asset-card")]
      .find((item) => item.dataset.assetId === state.selectedAsset?.id);
    if (!card) return;
    elements.assetGrid.scrollTo({ top: 0, behavior: reducedMotionQuery.matches ? "auto" : "smooth" });
    card.classList.remove("is-located");
    void card.offsetWidth;
    card.classList.add("is-located");
    card.addEventListener("animationend", () => card.classList.remove("is-located"), { once: true });
  }));
}

function assetCardForPointerEvent(event) {
  const card = event.target?.closest?.(".asset-card");
  return card && elements.assetGrid.contains(card) ? card : null;
}

function clearAssetCardHovers() {
  for (const card of elements.assetGrid.querySelectorAll(".asset-card.is-hovered")) assetCardHover.leave(card);
}

function enableAssetCardHover() {
  elements.assetGrid.addEventListener("pointerover", (event) => {
    if (reducedMotionQuery.matches || (event.pointerType && event.pointerType !== "mouse")) return;
    const card = assetCardForPointerEvent(event);
    if (!card || !assetCardHover.crossedBoundary(card, event.relatedTarget)) return;
    assetCardHover.enter(card);
  });
  elements.assetGrid.addEventListener("pointerout", (event) => {
    const card = assetCardForPointerEvent(event);
    if (!card || !assetCardHover.crossedBoundary(card, event.relatedTarget)) return;
    assetCardHover.leave(card);
  });
  reducedMotionQuery.addEventListener?.("change", (event) => {
    if (event.matches) clearAssetCardHovers();
  });
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = async () => {
      try {
        await image.decode?.();
      } catch {
        // The image is still drawable after a successful load in older hosts.
      }
      resolve(image);
    };
    image.onerror = () => reject(new Error("样机图片加载失败"));
    image.src = url;
  });
}

function sha256HexPortable(bytes) {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const paddedLength = Math.ceil((input.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(input);
  padded[input.length] = 0x80;

  const view = new DataView(padded.buffer);
  const bitLength = input.length * 8;
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);

  const constants = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ]);
  const schedule = new Uint32Array(64);
  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;
  const rotateRight = (value, shift) => (value >>> shift) | (value << (32 - shift));

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      schedule[index] = view.getUint32(offset + index * 4, false);
    }
    for (let index = 16; index < 64; index += 1) {
      const previous15 = schedule[index - 15];
      const previous2 = schedule[index - 2];
      const sigma0 = rotateRight(previous15, 7) ^ rotateRight(previous15, 18) ^ (previous15 >>> 3);
      const sigma1 = rotateRight(previous2, 17) ^ rotateRight(previous2, 19) ^ (previous2 >>> 10);
      schedule[index] = (schedule[index - 16] + sigma0 + schedule[index - 7] + sigma1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temporary1 = (h + sum1 + choice + constants[index] + schedule[index]) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporary2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((value) => value.toString(16).padStart(8, "0"))
    .join("");
}

async function sha256Hex(bytes) {
  if (!globalThis.crypto?.subtle) return sha256HexPortable(bytes);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function loadVerifiedCatalogImage(url, expectedSha256) {
  if (!/^[a-f0-9]{64}$/.test(expectedSha256 || "")) throw new Error("样机缺少有效素材摘要");
  const response = await withTimeout(fetch(url, { cache: "force-cache" }), 15_000);
  if (!response.ok) throw new Error(`样机图片返回 ${response.status}`);
  const bytes = await boundedResponse.readBoundedResponse(response, MAX_CATALOG_ASSET_BYTES, "样机素材");
  const actualSha256 = await sha256Hex(bytes);
  if (actualSha256 !== expectedSha256) throw new Error("样机图片完整性校验失败");
  const objectUrl = URL.createObjectURL(new Blob([bytes], { type: response.headers.get("content-type") || "image/png" }));
  try {
    return await loadImage(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function loadCatalogImage(relativePath, expectedSha256) {
  const url = resolveAssetUrl(relativePath);
  const cacheKey = `${url}#${expectedSha256}`;
  const cached = resourceLimits.readLru(catalogImageCache, cacheKey);
  if (cached) {
    return cached;
  }

  const request = loadVerifiedCatalogImage(url, expectedSha256).catch((error) => {
    resourceLimits.deleteIfSame(catalogImageCache, cacheKey, request);
    throw error;
  });
  resourceLimits.writeLru(catalogImageCache, cacheKey, request);
  return request;
}

async function loadAssetImages(asset) {
  const [baseImage] = await Promise.all([
    loadCatalogImage(asset.layers.base, asset.integrity.baseSha256),
    loadCatalogImage(asset.thumbnail, asset.integrity.thumbnailSha256)
  ]);
  const optionalLayers = await Promise.all(["reflection", "foreground"].map(async (name) => {
    if (!asset.layers[name]) return [name, null];
    return [name, await loadCatalogImage(asset.layers[name], asset.integrity[`${name}Sha256`])];
  }));
  return { baseImage, optionalLayers };
}

let catalogPreloadScheduled = false;

function scheduleCatalogPreload() {
  if (catalogPreloadScheduled || !state.manifest) return;
  catalogPreloadScheduled = true;
  const preload = () => {
    catalogPreloadScheduled = false;
    const items = state.manifest.items;
    const nearbyAssets = resourceLimits.nearestAssets(items, state.selectedAsset?.id);
    for (const asset of nearbyAssets) {
      loadAssetImages(asset).catch(() => {
        // A foreground selection reports failures. Background warming stays silent.
      });
    }
  };
  if (typeof requestIdleCallback === "function") requestIdleCallback(preload, { timeout: 800 });
  else setTimeout(preload, 180);
}

let assetRequestSequence = 0;

function resetContentTransition() {
  elements.stage.classList.remove("is-content-transition-ready", "is-content-transitioning");
  elements.contentTransitionCanvas.classList.remove("is-active");
  elements.contentTransitionCanvas.removeAttribute("style");
  const context = elements.contentTransitionCanvas.getContext("2d");
  context.clearRect(0, 0, elements.contentTransitionCanvas.width, elements.contentTransitionCanvas.height);
}

function captureContentTransitionSnapshot() {
  resetContentTransition();
  if (!state.baseImage || !elements.previewCanvas.width || !elements.previewCanvas.height) return false;
  const stageRect = elements.stage.getBoundingClientRect();
  const canvasRect = elements.canvasWrap.getBoundingClientRect();
  if (!stageRect.width || !stageRect.height || !canvasRect.width || !canvasRect.height) return false;

  const snapshot = elements.contentTransitionCanvas;
  snapshot.width = elements.previewCanvas.width;
  snapshot.height = elements.previewCanvas.height;
  snapshot.getContext("2d").drawImage(elements.previewCanvas, 0, 0);
  snapshot.style.left = `${canvasRect.left - stageRect.left}px`;
  snapshot.style.top = `${canvasRect.top - stageRect.top}px`;
  snapshot.style.width = `${canvasRect.width}px`;
  snapshot.style.height = `${canvasRect.height}px`;
  snapshot.classList.add("is-active");
  elements.stage.classList.add("is-content-transition-ready");
  return true;
}

async function playContentTransition(requestSequence, hasSnapshot) {
  if (!hasSnapshot || reducedMotionQuery.matches) {
    resetContentTransition();
    return;
  }
  await waitForNextPaint();
  if (requestSequence !== assetRequestSequence) return;
  elements.stage.classList.add("is-content-transitioning");
  await waitForDuration(CONTENT_TRANSITION_MS);
  if (requestSequence !== assetRequestSequence) return;
  resetContentTransition();
}

async function selectAsset(id) {
  const asset = state.manifest?.items.find((item) => item.id === id);
  if (!asset) return;
  if (state.selectedAsset?.id === id && state.baseImage && !state.rendering) return;
  const requestSequence = ++assetRequestSequence;
  const assetChanged = state.selectedAsset?.id !== id;
  closeSourcePopover();
  elements.downloadButton.disabled = true;
  elements.pasteButton.disabled = true;
  state.rendering = true;
  setAnimatedVisibility(elements.renderingBadge, true);
  const hasTransitionSnapshot = assetChanged && captureContentTransitionSnapshot();
  elements.canvasWrap.classList.add("is-content-switching");
  let committed = false;

  try {
    const { baseImage, optionalLayers } = await loadAssetImages(asset);
    if (requestSequence !== assetRequestSequence) return;

    // Commit the new asset only after every required image is ready. A failed
    // request therefore cannot leave the card selection ahead of the preview.
    state.selectedAsset = asset;
    if (assetChanged) {
      state.locatedAssetId = null;
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
    state.baseImage = baseImage;
    state.layerImages = Object.fromEntries(optionalLayers.filter(([, image]) => image));
    rememberRecent(id);
    elements.fitMode.value = "cover";
    syncAdjustmentControls();
    updateSourceGuide();
    elements.assetName.textContent = asset.name;
    elements.assetMeta.textContent = `${asset.canvas.width} × ${asset.canvas.height} · ${asset.status === "testing" ? "测试库" : "素材库"}`;
    if (state.segment === "similar" && elements.categorySelect.value === "all") {
      renderAssetGrid({ animate: true });
    } else {
      syncAssetSelection();
      renderRecentStrip();
    }
    resizePreviewSurface(1);
    if (assetChanged) fitStage();
    updatePerspectiveEditor();
    updateDesignEditor();
    renderFinalComposite();
    committed = true;
    setAnimatedVisibility(elements.renderingBadge, false);
    await playContentTransition(requestSequence, hasTransitionSnapshot);
  } catch (error) {
    if (requestSequence === assetRequestSequence) {
      if (BUILD_MODE === "development") console.error("样机素材加载失败", error);
      const message = state.selectedAsset
        ? "素材暂时无法加载，已保留当前样机"
        : "素材暂时无法加载，请确认素材服务已启动";
      showToast(message);
    }
  } finally {
    if (requestSequence === assetRequestSequence) {
      if (!committed) resetContentTransition();
      setAnimatedVisibility(elements.renderingBadge, false);
      state.rendering = false;
      elements.canvasWrap.classList.remove("is-content-switching");
      updateOutputAvailability();
      scheduleCatalogPreload();
    }
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
  const sourceActionLabel = hasDesign ? "换画面" : "添加画面";
  elements.replaceSourceButton.textContent = sourceActionLabel;
  elements.screenCta.setAttribute("aria-label", sourceActionLabel);
  elements.screenCta.querySelector("b").textContent = sourceActionLabel;
  elements.quickClearDesignButton.hidden = !hasDesign;
  elements.quickReadSelectionButton.disabled = !hasSelection;
  elements.quickSelectionLabel.textContent = hasSelection
    ? state.selection.message.replace(/^已选择[： ]*/, "")
    : "先在 Figma 画布中选择内容";
}

function openSourcePopover() {
  updateSourceActions();
  elements.screenCta.setAttribute("aria-expanded", "true");
  setAnimatedVisibility(elements.sourcePopover, true);
  requestAnimationFrame(() => {
    const target = elements.quickReadSelectionButton.disabled ? elements.quickImportFileButton : elements.quickReadSelectionButton;
    target.focus();
  });
}

function closeSourcePopover() {
  elements.screenCta.setAttribute("aria-expanded", "false");
  setAnimatedVisibility(elements.sourcePopover, false);
}

function toggleSourcePopover() {
  if (!elements.sourcePopover.classList.contains("is-visible")) openSourcePopover();
  else closeSourcePopover();
}

function activeQuad() {
  return state.customQuad || state.selectedAsset?.screen.quad || null;
}

function screenQuad() {
  return state.selectedAsset?.screen.quad || null;
}

function positionScreenCta() {
  const quad = screenQuad();
  const canvas = state.selectedAsset?.canvas;
  if (!quad || !canvas) return;
  const center = renderer.bilinearPoint(quad, 0.5, 0.5);
  elements.screenCta.style.left = `${center[0] / canvas.width * 100}%`;
  elements.screenCta.style.top = `${center[1] / canvas.height * 100}%`;
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
    elements.sourceMatch.textContent = "尚未添加画面；插件不会代替您生成内容";
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

function editingBoundsFrame() {
  const plane = screenPlane();
  return { cx: plane.width / 2, cy: plane.height / 2, width: plane.width, height: plane.height, rotation: 0 };
}

function resetContentGeometry() {
  const frame = editingBoundsFrame();
  state.contentFrame = { ...frame };
  state.imageFrame = state.designImage ? renderer.imageFrameForCover(state.designImage, frame) : { ...frame };
}

function ensureContentGeometry() {
  if (!state.selectedAsset || !state.designImage) return null;
  const recommended = state.selectedAsset.screen.recommendedSize;
  const geometry = renderer.contentGeometry(
    state.designImage,
    recommended.width / recommended.height,
    activeQuad(),
    state.contentFrame,
    state.imageFrame
  );
  state.contentFrame = { ...geometry.frame };
  state.imageFrame = { ...geometry.imageFrame };
  return geometry;
}

function planePointToCanvas(point) {
  const geometry = ensureContentGeometry();
  return geometry ? renderer.planePointToCanvas(point, geometry) : [0, 0];
}

function designControlPoints() {
  const geometry = ensureContentGeometry();
  // Rendering, hit testing, the selection outline and the crop frame all use
  // this exact projected frame. No second rectangle is derived elsewhere.
  return geometry ? geometry.overlayQuad.map((point) => [...point]) : [];
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

function framePath(points) {
  if (points.length !== 4) return "";
  return `M${points.map((point) => `${point[0]} ${point[1]}`).join("L")}Z`;
}

function updateDesignEditor() {
  const points = designControlPoints();
  const visible = points.length === 4;
  elements.designEditor.hidden = !visible;
  setAnimatedVisibility(elements.cropToolbar, state.cropMode);
  if (!visible) return;
  elements.designEditor.classList.toggle("is-selected", state.designSelected);
  elements.designEditor.classList.toggle("is-cropping", state.cropMode);
  elements.designEditor.classList.toggle("is-perspective", state.mode === "perspective");
  const pointString = points.map((point) => point.join(",")).join(" ");
  elements.designPolygon.setAttribute("points", pointString);
  elements.designDragTarget.setAttribute("points", pointString);
  elements.designDragTarget.setAttribute("aria-label", state.cropMode ? "移动裁切框" : "移动画面");
  const svg = elements.designPolygon.ownerSVGElement;
  svg.setAttribute("viewBox", `0 0 ${state.selectedAsset.canvas.width} ${state.selectedAsset.canvas.height}`);
  const cropPath = framePath(points);
  elements.cropFrame.setAttribute("d", cropPath);
  elements.cropShade.setAttribute(
    "d",
    `M0 0H${state.selectedAsset.canvas.width}V${state.selectedAsset.canvas.height}H0Z ${cropPath}`
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
  return renderer.viewportPointToCanvas(
    [event.clientX, event.clientY],
    rect,
    state.selectedAsset.canvas
  );
}

function pointOnScreenPlane(event) {
  const geometry = ensureContentGeometry();
  return geometry ? renderer.canvasPointToPlane(pointOnCanvas(event), geometry) : [0, 0];
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

function syncAdjustmentsFromFrame() {
  const geometry = ensureContentGeometry();
  if (!geometry) return;
  state.adjustments = renderer.adjustmentsFromImageFrame(
    state.designImage,
    geometry.imageFrame,
    geometry.frame,
    state.adjustments
  );
}

let stageSpacePressed = false;

function enableStageInteractions() {
  let interaction = null;
  let pendingContentClick = null;
  const warpHandles = { nw: [0], n: [0, 1], ne: [1], e: [1, 2], se: [2], s: [3, 2], sw: [3], w: [0, 3] };

  const finishContentClick = (finished, event) => {
    const click = {
      time: event.timeStamp || performance.now(),
      x: finished.startClientX,
      y: finished.startClientY
    };
    const previous = pendingContentClick;
    const isDoubleClick = previous
      && click.time - previous.time <= CONTENT_DOUBLE_CLICK_MS
      && Math.hypot(click.x - previous.x, click.y - previous.y) <= CONTENT_DOUBLE_CLICK_DISTANCE;
    pendingContentClick = isDoubleClick ? null : click;
    if (isDoubleClick) enterCropMode();
  };

  const beginPan = (event) => {
    stopStageViewAnimation();
    interaction = {
      kind: "stage-pan",
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPanX: state.panX,
      startPanY: state.panY,
      changed: false
    };
    elements.stage.classList.add("is-panning");
    try { elements.stage.setPointerCapture?.(event.pointerId); } catch {}
    event.preventDefault();
  };

  const beginContentEdit = (event, type, handleName = "") => {
    if (!state.designImage || !state.selectedAsset) return;
    stopStageViewAnimation();
    ensureContentGeometry();
    state.designSelected = true;
    updateDesignEditor();
    interaction = {
      kind: type === "move" ? "content-move" : "content-scale",
      pointerId: event.pointerId,
      handleName,
      freeTransform: !state.cropMode && type === "scale" && (state.mode === "perspective" || event.metaKey || event.ctrlKey),
      startControlQuad: designControlPoints(),
      startContentFrame: { ...state.contentFrame },
      startImageFrame: { ...state.imageFrame },
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPointerPlane: pointOnScreenPlane(event),
      startPointerCanvas: pointOnCanvas(event),
      changed: false,
      historyPushed: false
    };
    try { elements.stage.setPointerCapture?.(event.pointerId); } catch {}
    event.preventDefault();
  };

  elements.stage.addEventListener("pointerdown", (event) => {
    const scaleHandle = event.target.closest?.(".design-scale-handle");
    const dragTarget = event.target.closest?.(".design-drag-target");
    const excludedControl = event.target.closest?.("button, input, select, textarea, .source-popover, .crop-toolbar");

    if (event.button === 1 || stageSpacePressed) {
      beginPan(event);
      return;
    }
    if (event.button !== 0) return;
    if (scaleHandle) {
      beginContentEdit(event, "scale", scaleHandle.dataset.handle);
      return;
    }
    if (dragTarget) {
      beginContentEdit(event, "move");
      return;
    }
    if (excludedControl) return;

    if (state.designSelected) {
      if (state.cropMode) finishCropMode(true);
      state.designSelected = false;
      updateDesignEditor();
    }
    beginPan(event);
  });

  window.addEventListener("pointermove", (event) => {
    if (!interaction || interaction.pointerId !== event.pointerId) return;

    if (interaction.kind === "stage-pan") {
      const clientDx = event.clientX - interaction.startClientX;
      const clientDy = event.clientY - interaction.startClientY;
      interaction.changed ||= Math.hypot(clientDx, clientDy) >= 1;
      state.panX = interaction.startPanX + clientDx;
      state.panY = interaction.startPanY + clientDy;
      applyStageView();
      event.preventDefault();
      return;
    }

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

    if (interaction.kind === "content-move") {
      const desiredContent = {
        ...interaction.startContentFrame,
        cx: interaction.startContentFrame.cx + dx,
        cy: interaction.startContentFrame.cy + dy
      };
      const movedContent = renderer.constrainFrameToBounds(desiredContent, editingBoundsFrame());
      state.contentFrame = movedContent;
      if (state.cropMode) {
        state.imageFrame = { ...interaction.startImageFrame };
      } else {
        const movedImage = renderer.transformFrameBetweenFrames(
          interaction.startImageFrame,
          interaction.startContentFrame,
          movedContent
        );
        const residualX = desiredContent.cx - movedContent.cx;
        const residualY = desiredContent.cy - movedContent.cy;
        state.imageFrame = renderer.constrainImageFrameToCover(
          state.designImage,
          { ...movedImage, cx: movedImage.cx + residualX, cy: movedImage.cy + residualY },
          movedContent
        );
      }
    } else if (interaction.freeTransform) {
      const physicalQuad = screenQuad();
      const nextControlQuad = cloneQuad(interaction.startControlQuad);
      const canvasDx = pointerCanvas[0] - interaction.startPointerCanvas[0];
      const canvasDy = pointerCanvas[1] - interaction.startPointerCanvas[1];
      for (const index of warpHandles[interaction.handleName]) {
        const candidate = [
          interaction.startControlQuad[index][0] + canvasDx,
          interaction.startControlQuad[index][1] + canvasDy
        ];
        const [u, v] = renderer.inverseBilinearPoint(physicalQuad, candidate);
        nextControlQuad[index] = renderer.bilinearPoint(
          physicalQuad,
          Math.max(0, Math.min(1, u)),
          Math.max(0, Math.min(1, v))
        );
      }
      const recommended = state.selectedAsset.screen.recommendedSize;
      const nextSurfaceQuad = renderer.surfaceQuadForFrameQuad(
        interaction.startContentFrame,
        recommended.width / recommended.height,
        nextControlQuad
      );
      if (nextSurfaceQuad) state.customQuad = nextSurfaceQuad;
    } else {
      const resizedContent = renderer.resizeFrameWithinBounds(
        interaction.startContentFrame,
        interaction.handleName,
        interaction.startPointerPlane,
        pointerPlane,
        editingBoundsFrame(),
        true
      );
      state.contentFrame = resizedContent;
      state.imageFrame = state.cropMode
        ? { ...interaction.startImageFrame }
        : renderer.transformFrameBetweenFrames(
          interaction.startImageFrame,
          interaction.startContentFrame,
          resizedContent
        );
    }

    syncAdjustmentsFromFrame();
    commitDirectAdjustment();
    event.preventDefault();
  }, { passive: false });

  const finishInteraction = (event) => {
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    const finished = interaction;
    interaction = null;
    try {
      if (elements.stage.hasPointerCapture?.(event.pointerId)) elements.stage.releasePointerCapture(event.pointerId);
    } catch {}
    elements.stage.classList.remove("is-panning");
    if (finished.kind === "stage-pan") {
      applyStageView();
    } else if (event.type === "pointercancel") {
      pendingContentClick = null;
      updateDesignEditor();
    } else if (finished.changed) {
      pendingContentClick = null;
      renderFinalComposite();
    } else if (finished.kind === "content-move") {
      finishContentClick(finished, event);
      updateDesignEditor();
    } else {
      updateDesignEditor();
    }
  };
  window.addEventListener("pointerup", finishInteraction);
  window.addEventListener("pointercancel", finishInteraction);

  elements.designDragTarget.addEventListener("keydown", (event) => {
    const step = event.shiftKey ? 10 : 1;
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    pushHistory();
    const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
    const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
    const startContent = { ...state.contentFrame };
    const nextContent = renderer.constrainFrameToBounds(
      { ...startContent, cx: startContent.cx + dx, cy: startContent.cy + dy },
      editingBoundsFrame()
    );
    state.contentFrame = nextContent;
    if (!state.cropMode) {
      const movedImage = renderer.transformFrameBetweenFrames(state.imageFrame, startContent, nextContent);
      state.imageFrame = renderer.constrainImageFrameToCover(
        state.designImage,
        { ...movedImage, cx: movedImage.cx + (startContent.cx + dx - nextContent.cx), cy: movedImage.cy + (startContent.cy + dy - nextContent.cy) },
        nextContent
      );
    }
    syncAdjustmentsFromFrame();
    commitDirectAdjustment();
    renderFinalComposite();
    event.preventDefault();
  });
  for (const handle of elements.designEditor.querySelectorAll(".design-scale-handle")) {
    handle.addEventListener("keydown", (event) => {
      if (!["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"].includes(event.key)) return;
      const handleName = handle.dataset.handle;
      const horizontalEdge = handleName === "e" || handleName === "w";
      const verticalEdge = handleName === "n" || handleName === "s";
      if ((horizontalEdge && ["ArrowUp", "ArrowDown"].includes(event.key))
        || (verticalEdge && ["ArrowLeft", "ArrowRight"].includes(event.key))) return;
      pushHistory();
      const step = event.shiftKey ? 10 : 1;
      const startContent = { ...state.contentFrame };
      const startPointer = designHandlePoints(renderer.frameCorners(startContent))[handleName];
      const pointer = [
        startPointer[0] + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0),
        startPointer[1] + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0)
      ];
      const nextContent = renderer.resizeFrameWithinBounds(
        startContent,
        handleName,
        startPointer,
        pointer,
        editingBoundsFrame(),
        true
      );
      state.contentFrame = nextContent;
      if (!state.cropMode) {
        state.imageFrame = renderer.transformFrameBetweenFrames(state.imageFrame, startContent, nextContent);
      }
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

function desiredPreviewRenderScale() {
  return state.zoom >= HIGH_RES_PREVIEW_ZOOM ? MAX_PREVIEW_RENDER_SCALE : 1;
}

function resizePreviewSurface(scale = desiredPreviewRenderScale()) {
  if (!state.selectedAsset) return false;
  const width = Math.round(state.selectedAsset.canvas.width * scale);
  const height = Math.round(state.selectedAsset.canvas.height * scale);
  if (elements.previewCanvas.width === width && elements.previewCanvas.height === height) return false;
  elements.previewCanvas.width = width;
  elements.previewCanvas.height = height;
  return true;
}

function renderToCanvas(canvas, quality = "final") {
  if (!state.selectedAsset || !state.baseImage) return;
  if (state.designImage) ensureContentGeometry();
  const renderDesign = state.designImage;
  renderer.renderComposite({
    canvas,
    asset: state.selectedAsset,
    baseImage: state.baseImage,
    designImage: renderDesign,
    fit: "cover",
    adjustments: state.adjustments,
    crop: state.crop,
    content: state.designImage ? { frame: state.contentFrame, imageFrame: state.imageFrame } : null,
    quad: screenQuad(),
    designQuad: activeQuad(),
    layerImages: state.layerImages,
    quality
  });
}

function renderComposite(quality = "final") {
  if (!state.selectedAsset || !state.baseImage) return;
  resizePreviewSurface();
  renderToCanvas(elements.previewCanvas, quality);
  if (state.designImage) {
    elements.screenCta.classList.add("has-image");
  } else {
    elements.screenCta.classList.remove("has-image");
    positionScreenCta();
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

function renderOutputCanvas() {
  if (!state.selectedAsset || !state.baseImage) return null;
  const canvas = document.createElement("canvas");
  canvas.width = state.selectedAsset.canvas.width;
  canvas.height = state.selectedAsset.canvas.height;
  renderToCanvas(canvas, "final");
  return canvas;
}

function updatePerspectiveEditor() {
  const quad = activeQuad();
  if (!quad || !state.selectedAsset) return;
  const original = state.selectedAsset.screen.quad;
  const unchanged = quad.every((point, index) => point.every((value, axis) => Math.abs(value - original[index][axis]) < 0.5));
  elements.perspectiveStatus.textContent = unchanged ? "默认透视" : "已调整";
}

function setMode(mode) {
  if (state.mode === mode) return;
  state.mode = mode;
  closeCategoryMenu();
  closeSourcePopover();
  document.querySelectorAll(".mode-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.mode === mode));
  setAnimatedVisibility(elements.catalogView, mode === "catalog");
  setAnimatedVisibility(elements.adjustPanel, mode !== "catalog");
  elements.adjustControls.hidden = mode !== "adjust";
  elements.perspectiveControls.hidden = mode !== "perspective";
  if (mode === "adjust") replayEnter(elements.adjustControls);
  if (mode === "perspective") replayEnter(elements.perspectiveControls);
  elements.designEditor.hidden = !state.designImage;
  elements.adjustPanelTitle.textContent = mode === "perspective" ? "透视编辑" : "画面调整";
  elements.stageTitle.textContent = mode === "perspective" ? "自由透视" : mode === "adjust" ? "画面调整" : "预览";
  replayEnter(elements.stageTitle);
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
    state.imageFrame = renderer.imageFrameFromAdjustments(
      state.designImage,
      state.contentFrame,
      nextAdjustments
    );
  }
  state.adjustments = nextAdjustments;
  if (state.designImage) syncAdjustmentsFromFrame();
  syncAdjustmentControls();
  updateDesignEditor();
  scheduleComposite("preview");
}

async function setDesignBytes(bytes, name, mimeType = "image/png", metadata = {}) {
  const nextObjectUrl = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  let nextImage;
  try {
    nextImage = await loadImage(nextObjectUrl);
  } catch (error) {
    URL.revokeObjectURL(nextObjectUrl);
    throw error;
  }
  pushHistory();
  state.designObjectUrl = nextObjectUrl;
  state.designImage = nextImage;
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

function removeDesign() {
  if (!state.designImage) return false;
  pushHistory();
  state.designObjectUrl = null;
  state.designImage = null;
  state.designName = "";
  state.designSource = null;
  restoreDefaultMockupState({ clearContentGeometry: true });
  elements.designSourceLabel.textContent = "尚未读取画面";
  elements.clearDesignButton.disabled = true;
  elements.imageInput.value = "";
  closeSourcePopover();
  updateSourceActions();
  updateSourceGuide();
  updateOutputAvailability();
  renderFinalComposite();
  showToast("已移除画面");
  return true;
}

const EDITOR_COMMANDS = Object.freeze({
  removeContent: "remove-content",
  undo: "undo",
  redo: "redo"
});

function executeEditorCommand(command) {
  if (command === EDITOR_COMMANDS.removeContent) return removeDesign();
  if (command === EDITOR_COMMANDS.undo) return undoEditor();
  if (command === EDITOR_COMMANDS.redo) return redoEditor();
  return false;
}

function keyboardEditorCommand(event) {
  if (event.isComposing) return null;
  const editable = document.activeElement?.closest?.("input, select, textarea, [contenteditable]:not([contenteditable='false'])");
  if (editable) return null;
  const key = event.key.toLowerCase();
  const commandModifier = event.metaKey || event.ctrlKey;
  if (commandModifier && key === "z") return event.shiftKey ? EDITOR_COMMANDS.redo : EDITOR_COMMANDS.undo;
  if (commandModifier && key === "y") return EDITOR_COMMANDS.redo;
  if (!event.metaKey && !event.ctrlKey && !event.altKey && (event.key === "Backspace" || event.key === "Delete")) {
    return state.designImage && state.designSelected ? EDITOR_COMMANDS.removeContent : null;
  }
  return null;
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
  if (file.size > MAX_LOCAL_FILE_BYTES) {
    showToast(`文件不能超过 ${Math.floor(MAX_LOCAL_FILE_BYTES / (1024 * 1024))} MB`);
    elements.imageInput.value = "";
    return;
  }
  try {
    if (supportedVideo) await importVideoFile(file);
    else if (supportedPdf) await importPdfFile(file);
    else await setDesignBytes(new Uint8Array(await file.arrayBuffer()), file.name, file.type || "image/svg+xml", { type: extension === "svg" ? "SVG" : "图片" });
    showToast(`已导入：${file.name}`);
  } catch (error) {
    showFailure("file-import", error, USER_ERROR_CODES.FILE_READ_FAILED);
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

function restoreDefaultMockupState({ clearContentGeometry = false } = {}) {
  state.adjustments = { ...DEFAULT_ADJUSTMENTS };
  state.crop = { ...DEFAULT_CROP };
  if (state.selectedAsset) state.customQuad = state.selectedAsset.screen.quad.map((point) => [...point]);
  if (clearContentGeometry) {
    state.contentFrame = null;
    state.imageFrame = null;
  } else if (state.designImage) {
    resetContentGeometry();
  }
  elements.fitMode.value = "cover";
  state.designSelected = false;
  state.cropMode = false;
  state.cropSnapshot = null;
  state.cropHistoryDepth = 0;
  syncAdjustmentControls();
}

function resetCurrentMockup() {
  if (!state.selectedAsset) return;
  pushHistory();
  restoreDefaultMockupState();
  fitStage(true);
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

function canvasBlob(canvas = elements.previewCanvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("无法生成 PNG"));
    }, "image/png");
  });
}

async function downloadRender() {
  try {
    const outputCanvas = renderOutputCanvas();
    if (!outputCanvas) throw new Error("暂无可导出的样机");
    const blob = await canvasBlob(outputCanvas);
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
    showFailure("download-render", error, USER_ERROR_CODES.EXPORT_FAILED);
  }
}

async function pasteRender() {
  try {
    elements.pasteButton.disabled = true;
    elements.pasteButton.textContent = "正在粘贴";
    const outputCanvas = renderOutputCanvas();
    if (!outputCanvas) throw new Error("暂无可粘贴的样机");
    const blob = await canvasBlob(outputCanvas);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    postPluginMessage({
      type: "paste-render",
      bytes,
      width: outputCanvas.width,
      height: outputCanvas.height,
      name: `${state.selectedAsset?.name || "样机"} · 小鸟样机`
    });
  } catch (error) {
    elements.pasteButton.disabled = false;
    elements.pasteButton.textContent = "粘贴到画布";
    showFailure("paste-render", error, USER_ERROR_CODES.PASTE_FAILED);
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
  schedulePreviewResolutionCommit();
}

let stageViewTimer = 0;
let previewResolutionTimer = 0;

function schedulePreviewResolutionCommit() {
  if (!state.selectedAsset || !state.baseImage) return;
  const expectedWidth = Math.round(state.selectedAsset.canvas.width * desiredPreviewRenderScale());
  if (elements.previewCanvas.width === expectedWidth) return;
  clearTimeout(previewResolutionTimer);
  previewResolutionTimer = setTimeout(() => {
    previewResolutionTimer = 0;
    renderFinalComposite();
  }, reducedMotionQuery.matches ? 0 : PREVIEW_RESOLUTION_SETTLE_MS);
}

function stopStageViewAnimation() {
  clearTimeout(stageViewTimer);
  stageViewTimer = 0;
  elements.canvasWrap.classList.remove("is-view-animating");
}

function animateStageView(change) {
  clearTimeout(stageViewTimer);
  stageViewTimer = 0;
  if (reducedMotionQuery.matches) {
    elements.canvasWrap.classList.remove("is-view-animating");
    change();
    return;
  }
  const wasAnimating = elements.canvasWrap.classList.contains("is-view-animating");
  elements.canvasWrap.classList.add("is-view-animating");
  if (!wasAnimating) void elements.canvasWrap.offsetWidth;
  change();
  stageViewTimer = setTimeout(stopStageViewAnimation, STAGE_VIEW_MOTION_MS);
}

function updateZoom(delta, animated = false) {
  const change = () => setStageZoom(state.zoom + delta);
  if (animated) animateStageView(change);
  else change();
}

function fitStage(animated = false) {
  const change = () => {
    sizeCanvasWrap();
    state.zoom = 1;
    state.panX = 0;
    state.panY = 0;
    applyStageView();
    schedulePreviewResolutionCommit();
  };
  if (animated) animateStageView(change);
  else change();
}

function enableStageNavigation() {
  window.addEventListener("keydown", (event) => {
    const editorCommand = keyboardEditorCommand(event);
    if (editorCommand) {
      executeEditorCommand(editorCommand);
      event.preventDefault();
      return;
    }
    const editable = /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || "");
    if (event.code === "Space" && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement?.tagName || "")) {
      stageSpacePressed = true;
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
    if (event.code === "Space") stageSpacePressed = false;
  });
  window.addEventListener("blur", () => {
    stageSpacePressed = false;
    elements.stage.classList.remove("is-panning");
  });

  elements.stage.addEventListener("wheel", (event) => {
    event.preventDefault();
    stopStageViewAnimation();
    if (event.ctrlKey || event.metaKey) {
      const factor = Math.exp(-event.deltaY * 0.01);
      setStageZoom(state.zoom * factor, event.clientX, event.clientY);
    } else {
      state.panX -= event.deltaX;
      state.panY -= event.deltaY;
      applyStageView();
    }
  }, { passive: false });

  window.addEventListener("resize", () => {
    sizeCanvasWrap();
    applyStageView();
  });
}

let appliedWindowState = "expanded";
let pendingWindowState = null;

function applyWindowTransitionProgress(progress) {
  const normalizedProgress = Math.max(0, Math.min(1, Number(progress) || 0));
  document.documentElement.style.setProperty("--window-collapse-progress", String(normalizedProgress));
}

function applyWindowVisualState(windowState) {
  const collapsed = windowState === "collapsed";
  applyWindowTransitionProgress(collapsed ? 1 : 0);
  document.documentElement.classList.toggle("is-collapsed", collapsed);
  elements.appShell.setAttribute("aria-hidden", String(collapsed));
  elements.collapsedBar.setAttribute("aria-hidden", String(!collapsed));
  (collapsed ? elements.expandButton : elements.collapseButton).focus({ preventScroll: true });
}

function setWindowState(windowState) {
  const targetState = windowState === "collapsed" ? "collapsed" : "expanded";
  if (pendingWindowState === targetState || (!pendingWindowState && appliedWindowState === targetState)) return;
  pendingWindowState = targetState;
  document.documentElement.setAttribute("data-window-transition", targetState);
  postPluginMessage({ type: "set-window-state", state: targetState });
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
    setCatalogSegment(segment.dataset.filter);
  });
  segment.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const segments = [...document.querySelectorAll(".segment")];
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const next = segments[(segments.indexOf(segment) + direction + segments.length) % segments.length];
    next.focus();
    next.click();
  });
}

elements.refreshButton.addEventListener("click", fetchCatalog);
elements.locateCurrentAsset.addEventListener("click", locateSelectedAsset);
elements.assetGrid.addEventListener("click", selectAssetFromCatalogEvent);
elements.recentItems.addEventListener("click", selectAssetFromCatalogEvent);
elements.searchInput.addEventListener("input", () => {
  state.locatedAssetId = null;
  elements.clearSearch.hidden = !elements.searchInput.value;
  renderAssetGrid();
});
elements.clearSearch.addEventListener("click", () => {
  state.locatedAssetId = null;
  elements.searchInput.value = "";
  elements.clearSearch.hidden = true;
  elements.searchInput.focus();
  renderAssetGrid({ animate: true });
});
elements.categoryTrigger.addEventListener("click", () => {
  if (elements.categoryTrigger.getAttribute("aria-expanded") === "true") closeCategoryMenu();
  else openCategoryMenu();
});
elements.categoryTrigger.addEventListener("keydown", (event) => {
  if (!["ArrowDown", "ArrowUp", "Escape"].includes(event.key)) return;
  event.preventDefault();
  if (event.key === "Escape") closeCategoryMenu();
  else {
    openCategoryMenu();
    requestAnimationFrame(() => moveCategoryFocus(event.key === "ArrowDown" ? 1 : -1));
  }
});
elements.categoryMenu.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    closeCategoryMenu({ restoreFocus: true });
    return;
  }
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  if (event.key === "Home") categoryOptions()[0]?.focus();
  else if (event.key === "End") categoryOptions().at(-1)?.focus();
  else moveCategoryFocus(event.key === "ArrowDown" ? 1 : -1);
});
document.addEventListener("pointerdown", (event) => {
  if (elements.categoryTrigger.getAttribute("aria-expanded") === "true" && !elements.categoryPicker.contains(event.target)) {
    closeCategoryMenu();
  }
});
document.addEventListener("focusin", (event) => {
  if (elements.categoryTrigger.getAttribute("aria-expanded") === "true" && !elements.categoryPicker.contains(event.target)) {
    closeCategoryMenu();
  }
});
elements.readSelectionButton.addEventListener("click", requestSelection);
elements.importFileButton.addEventListener("click", () => elements.imageInput.click());
elements.imageInput.addEventListener("change", () => importDesignFile(elements.imageInput.files?.[0]));
elements.clearDesignButton.addEventListener("click", () => executeEditorCommand(EDITOR_COMMANDS.removeContent));
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
elements.quickClearDesignButton.addEventListener("click", () => executeEditorCommand(EDITOR_COMMANDS.removeContent));
document.addEventListener("pointerdown", (event) => {
  if (elements.sourcePopover.hidden) return;
  if (elements.sourcePopover.contains(event.target) || elements.replaceSourceButton.contains(event.target) || elements.screenCta.contains(event.target)) return;
  closeSourcePopover();
});
elements.downloadButton.addEventListener("click", downloadRender);
elements.pasteButton.addEventListener("click", pasteRender);
elements.zoomIn.addEventListener("click", () => updateZoom(0.1, true));
elements.zoomOut.addEventListener("click", () => updateZoom(-0.1, true));
elements.zoomReset.addEventListener("click", () => fitStage(true));
elements.clearRecent.addEventListener("click", () => {
  safeStorage.removeItem(RECENT_KEY);
  renderRecentStrip();
});
elements.collapseButton.addEventListener("click", () => setWindowState("collapsed"));
elements.expandButton.addEventListener("click", () => setWindowState("expanded"));
syncAdjustmentControls();
updateSourceActions();
enableStageInteractions();
enableStageNavigation();
enableAssetCardHover();
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

  if (message.type === "window-state-applied") {
    const appliedState = message.state === "collapsed" ? "collapsed" : "expanded";
    if (pendingWindowState && pendingWindowState !== appliedState) return;
    applyWindowVisualState(appliedState);
    appliedWindowState = appliedState;
    pendingWindowState = null;
    document.documentElement.removeAttribute("data-window-transition");
    return;
  }

  if (message.type === "window-state-progress") {
    const progressState = message.state === "collapsed" ? "collapsed" : "expanded";
    if (pendingWindowState && pendingWindowState !== progressState) return;
    if (!reducedMotionQuery.matches) applyWindowTransitionProgress(message.progress);
    return;
  }

  if (message.type === "catalog-cache") {
    state.pluginCatalogCache = message.cache;
    if (!state.manifest && message.cache) {
      try {
        state.manifest = validateCachedCatalog(message.cache);
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
    showToast(userErrors.messageFromPayload(message, USER_ERROR_CODES.SELECTION_READ_FAILED));
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
    showToast(userErrors.messageFromPayload(message, USER_ERROR_CODES.PASTE_FAILED));
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
