const PLUGIN_VERSION = "0.1.0";
const DEVELOPMENT_CATALOG_URL = "http://localhost:4173/catalog/v1/manifest.json";
const PRODUCTION_CATALOG_URL = "https://assets.mockup-studio.example/catalog/v1/manifest.json";
const ACTIVE_CATALOG_URL = DEVELOPMENT_CATALOG_URL;
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
  freeOnly: document.querySelector("#freeOnly"),
  catalogCount: document.querySelector("#catalogCount"),
  catalogVersion: document.querySelector("#catalogVersion"),
  assetGrid: document.querySelector("#assetGrid"),
  catalogEmpty: document.querySelector("#catalogEmpty"),
  selectionChip: document.querySelector("#selectionChip"),
  selectionText: document.querySelector("#selectionText"),
  readSelectionButton: document.querySelector("#readSelectionButton"),
  fitMode: document.querySelector("#fitMode"),
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
  zoomLabel: document.querySelector("#zoomLabel"),
  fitStageButton: document.querySelector("#fitStageButton"),
  recentStrip: document.querySelector("#recentStrip"),
  recentItems: document.querySelector("#recentItems"),
  clearRecent: document.querySelector("#clearRecent"),
  collapseButton: document.querySelector("#collapseButton"),
  expandButton: document.querySelector("#expandButton"),
  collapsedBar: document.querySelector("#collapsedBar"),
  resizeGrip: document.querySelector("#resizeGrip"),
  menuButton: document.querySelector("#menuButton"),
  toast: document.querySelector("#toast")
};

const state = {
  manifest: null,
  catalogBaseUrl: ACTIVE_CATALOG_URL,
  catalogMode: "loading",
  selectedAsset: null,
  baseImage: null,
  designImage: null,
  designObjectUrl: null,
  selection: null,
  segment: "all",
  zoom: 1,
  rendering: false,
  pluginCatalogCache: null
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
  elements.catalogState.querySelector(".catalog-state-label").textContent = label;
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
  if (!manifest || manifest.schemaVersion !== 1) throw new Error("不支持的素材清单版本");
  if (!Array.isArray(manifest.items)) throw new Error("素材清单缺少 items");
  for (const item of manifest.items) {
    if (!item.id || !item.name || item.renderer !== "static-screen-v1") {
      throw new Error(`样机条目不完整：${item.id || "unknown"}`);
    }
    if (!item.canvas || !Number.isFinite(item.canvas.width) || !Number.isFinite(item.canvas.height)) {
      throw new Error(`样机画布尺寸无效：${item.id}`);
    }
    if (!item.screen || !Array.isArray(item.screen.quad) || item.screen.quad.length !== 4) {
      throw new Error(`样机屏幕坐标无效：${item.id}`);
    }
    if (!item.layers || !item.layers.base || !item.thumbnail) {
      throw new Error(`样机资源路径无效：${item.id}`);
    }
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
  elements.catalogVersion.textContent = state.manifest.catalogVersion;
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
  const onlyFree = elements.freeOnly.checked;

  return state.manifest.items.filter((item) => {
    if (state.segment === "packs") return false;
    if (state.segment === "similar" && state.selectedAsset && item.category !== state.selectedAsset.category) return false;
    if (category !== "all" && item.category !== category) return false;
    if (onlyFree && !item.isFree) return false;
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
    elements.catalogEmpty.querySelector("strong").textContent = state.segment === "packs" ? "套装即将开放" : "没有找到样机";
    elements.catalogEmpty.querySelector("span").textContent = state.segment === "packs" ? "当前版本先验证单个样机流程" : "换个关键词或分类试试";
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
    meta.textContent = item.isFree ? "免费 · 静态" : "静态";
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
  rememberRecent(id);
  elements.fitMode.value = asset.screen.defaultFit || "cover";
  elements.assetName.textContent = asset.name;
  elements.assetMeta.textContent = `${asset.canvas.width} × ${asset.canvas.height} · ${asset.isFree ? "免费" : "素材库"}`;
  elements.downloadButton.disabled = true;
  elements.pasteButton.disabled = true;
  state.rendering = true;
  elements.renderingBadge.hidden = false;
  renderAssetGrid();

  try {
    state.baseImage = await loadImage(resolveAssetUrl(asset.layers.base));
    elements.previewCanvas.width = asset.canvas.width;
    elements.previewCanvas.height = asset.canvas.height;
    await renderComposite();
  } catch (error) {
    showToast(error instanceof Error ? error.message : "样机加载失败");
  } finally {
    state.rendering = false;
    elements.renderingBadge.hidden = true;
    elements.downloadButton.disabled = !state.baseImage;
    elements.pasteButton.disabled = !state.baseImage;
  }
}

function quadSize(quad) {
  const distance = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  return {
    width: (distance(quad[0], quad[1]) + distance(quad[3], quad[2])) / 2,
    height: (distance(quad[0], quad[3]) + distance(quad[1], quad[2])) / 2
  };
}

function bilinearPoint(quad, u, v) {
  const topX = quad[0][0] + (quad[1][0] - quad[0][0]) * u;
  const topY = quad[0][1] + (quad[1][1] - quad[0][1]) * u;
  const bottomX = quad[3][0] + (quad[2][0] - quad[3][0]) * u;
  const bottomY = quad[3][1] + (quad[2][1] - quad[3][1]) * u;
  return [topX + (bottomX - topX) * v, topY + (bottomY - topY) * v];
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

function insetQuad(quad, sourceAspect, targetAspect) {
  let minU = 0;
  let maxU = 1;
  let minV = 0;
  let maxV = 1;
  if (sourceAspect > targetAspect) {
    const heightRatio = targetAspect / sourceAspect;
    minV = (1 - heightRatio) / 2;
    maxV = 1 - minV;
  } else {
    const widthRatio = sourceAspect / targetAspect;
    minU = (1 - widthRatio) / 2;
    maxU = 1 - minU;
  }
  return [
    bilinearPoint(quad, minU, minV),
    bilinearPoint(quad, maxU, minV),
    bilinearPoint(quad, maxU, maxV),
    bilinearPoint(quad, minU, maxV)
  ];
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

function drawImageToQuad(context, image, originalQuad, fit) {
  const target = quadSize(originalQuad);
  const targetAspect = target.width / target.height;
  const sourceAspect = image.width / image.height;
  let quad = originalQuad;
  let sourceRect = { x: 0, y: 0, width: image.width, height: image.height };

  if (fit === "cover") {
    if (sourceAspect > targetAspect) {
      sourceRect.width = image.height * targetAspect;
      sourceRect.x = (image.width - sourceRect.width) / 2;
    } else {
      sourceRect.height = image.width / targetAspect;
      sourceRect.y = (image.height - sourceRect.height) / 2;
    }
  } else if (fit === "contain") {
    fillQuad(context, originalQuad, "#0d0d0d");
    quad = insetQuad(originalQuad, sourceAspect, targetAspect);
  }

  const columns = 18;
  const rows = 10;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const u0 = column / columns;
      const u1 = (column + 1) / columns;
      const v0 = row / rows;
      const v1 = (row + 1) / rows;
      const sx0 = sourceRect.x + sourceRect.width * u0;
      const sx1 = sourceRect.x + sourceRect.width * u1;
      const sy0 = sourceRect.y + sourceRect.height * v0;
      const sy1 = sourceRect.y + sourceRect.height * v1;
      const d00 = bilinearPoint(quad, u0, v0);
      const d10 = bilinearPoint(quad, u1, v0);
      const d11 = bilinearPoint(quad, u1, v1);
      const d01 = bilinearPoint(quad, u0, v1);
      drawMappedTriangle(context, image, [[sx0, sy0], [sx1, sy0], [sx1, sy1]], [d00, d10, d11]);
      drawMappedTriangle(context, image, [[sx0, sy0], [sx1, sy1], [sx0, sy1]], [d00, d11, d01]);
    }
  }
}

async function renderComposite() {
  if (!state.selectedAsset || !state.baseImage) return;
  const canvas = elements.previewCanvas;
  const context = canvas.getContext("2d", { alpha: false });
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(state.baseImage, 0, 0, canvas.width, canvas.height);
  if (state.designImage) {
    drawImageToQuad(context, state.designImage, state.selectedAsset.screen.quad, elements.fitMode.value);
    elements.screenCta.classList.add("has-image");
    elements.screenCta.querySelector("b").textContent = "重新读取选区";
  } else {
    elements.screenCta.classList.remove("has-image");
    elements.screenCta.querySelector("b").textContent = "选择 Figma 画面";
  }
}

function requestSelection() {
  if (!state.selection?.available) {
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
  elements.zoomLabel.textContent = `${Math.round(state.zoom * 100)}%`;
}

function fitStage() {
  state.zoom = 1;
  elements.canvasWrap.style.transform = "scale(1)";
  elements.zoomLabel.textContent = "适应";
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
  tab.addEventListener("click", () => {
    if (tab.dataset.mode !== "static") {
      showToast(`${tab.textContent.replace(/开发中|规划中/g, "").trim()}尚未实现；当前只开放真实可用的静态样机`);
      return;
    }
    document.querySelectorAll(".mode-tab").forEach((item) => item.classList.toggle("active", item === tab));
  });
}

for (const segment of document.querySelectorAll(".segment")) {
  segment.addEventListener("click", () => {
    state.segment = segment.dataset.filter;
    document.querySelectorAll(".segment").forEach((item) => item.classList.toggle("active", item === segment));
    renderAssetGrid();
  });
}

elements.refreshButton.addEventListener("click", fetchCatalog);
elements.searchInput.addEventListener("input", renderAssetGrid);
elements.clearSearch.addEventListener("click", () => {
  elements.searchInput.value = "";
  elements.searchInput.focus();
  renderAssetGrid();
});
elements.categorySelect.addEventListener("change", renderAssetGrid);
elements.freeOnly.addEventListener("change", renderAssetGrid);
elements.fitMode.addEventListener("change", renderComposite);
elements.readSelectionButton.addEventListener("click", requestSelection);
elements.screenCta.addEventListener("click", requestSelection);
elements.downloadButton.addEventListener("click", downloadRender);
elements.pasteButton.addEventListener("click", pasteRender);
elements.backgroundToggle.addEventListener("click", () => elements.stage.classList.toggle("light"));
elements.zoomIn.addEventListener("click", () => updateZoom(0.1));
elements.zoomOut.addEventListener("click", () => updateZoom(-0.1));
elements.fitStageButton.addEventListener("click", fitStage);
elements.clearRecent.addEventListener("click", () => {
  safeStorage.removeItem(RECENT_KEY);
  renderRecentStrip();
});
elements.collapseButton.addEventListener("click", () => setWindowState("collapsed"));
elements.expandButton.addEventListener("click", () => setWindowState("expanded"));
elements.menuButton.addEventListener("click", () => showToast(`样机工作室 v${PLUGIN_VERSION} · 远程素材目录`));
document.querySelector("#settingsButton").addEventListener("click", () => showToast("设置将在远程素材链路验证后开放"));
document.querySelector("#aboutButton").addEventListener("click", () => showToast("样机工作室 · 自有素材与渲染引擎"));
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
    elements.readSelectionButton.textContent = "重新读取";
    if (state.designObjectUrl) URL.revokeObjectURL(state.designObjectUrl);
    state.designObjectUrl = URL.createObjectURL(new Blob([message.bytes], { type: "image/png" }));
    state.designImage = await loadImage(state.designObjectUrl);
    await renderComposite();
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
