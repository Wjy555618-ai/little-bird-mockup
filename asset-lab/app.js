const MANIFEST_URL = "/catalog/testing/v1/manifest.json";
const REQUIRED_PATTERNS = ["grid", "landscape", "portrait", "edge"];
const MANUAL_KEYS = ["frameFit", "perspective", "edgeMask", "imageQuality", "allPatterns"];
const renderer = window.MockupRenderer;

const elements = Object.fromEntries([
  "libraryState", "rendererVersion", "reloadButton", "catalogVersion", "assetCount", "assetList", "assetName", "assetMeta",
  "patternTabs", "stage", "canvasWrap", "previewCanvas", "quadEditor", "quadPolygon", "resetGeometryButton", "saveGeometryButton",
  "automaticSummary", "automaticChecks", "patternSummary", "patternVisits", "approvalTitle", "approvalHint", "approveButton", "toast"
].map((id) => [id, document.getElementById(id)]));

const state = {
  manifest: null,
  selected: null,
  baseImage: null,
  layerImages: {},
  quad: null,
  apertureQuad: null,
  pattern: "grid",
  visitedPatterns: new Set(["grid"]),
  automaticChecks: {},
  seamMetrics: null,
  approvedIds: new Set(),
  draggingCorner: null
};

elements.rendererVersion.textContent = `Renderer ${renderer.VERSION}`;

function toast(message) {
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { elements.toast.hidden = true; }, 2400);
}

function resolveAsset(path) {
  return new URL(path, new URL(MANIFEST_URL, location.href)).href;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`图片加载失败：${url}`));
    image.src = url;
  });
}

function makePattern(id) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (id === "portrait") {
    canvas.width = 900;
    canvas.height = 1600;
    const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, "#5664d8");
    gradient.addColorStop(0.55, "#c05e99");
    gradient.addColorStop(1, "#f0a85e");
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#fff";
    context.font = "700 84px sans-serif";
    context.fillText("PORTRAIT", 64, 1320);
    context.fillRect(64, 1370, 430, 14);
  } else if (id === "edge") {
    canvas.width = 1200;
    canvas.height = 1200;
    context.fillStyle = "#fff";
    context.fillRect(0, 0, 600, 1200);
    context.fillStyle = "#000";
    context.fillRect(600, 0, 600, 1200);
    context.strokeStyle = "#ff3154";
    context.lineWidth = 18;
    context.strokeRect(18, 18, 1164, 1164);
    context.fillStyle = "#ff3154";
    context.fillRect(580, 0, 40, 1200);
  } else if (id === "landscape") {
    canvas.width = 1600;
    canvas.height = 1000;
    const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, "#0e255d");
    gradient.addColorStop(0.48, "#198fa5");
    gradient.addColorStop(1, "#d6b35d");
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#ffffff14";
    for (let index = 0; index < 9; index += 1) context.fillRect(80 + index * 170, 90, 120, 720);
    context.fillStyle = "white";
    context.font = "700 82px sans-serif";
    context.fillText("LANDSCAPE", 72, 910);
  } else {
    canvas.width = 1600;
    canvas.height = 1000;
    context.fillStyle = "#e9e9eb";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#202024";
    context.lineWidth = 4;
    for (let x = 0; x <= canvas.width; x += 100) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, canvas.height); context.stroke(); }
    for (let y = 0; y <= canvas.height; y += 100) { context.beginPath(); context.moveTo(0, y); context.lineTo(canvas.width, y); context.stroke(); }
    context.fillStyle = "#ff3154";
    [[0, 0], [1450, 0], [1450, 850], [0, 850]].forEach(([x, y]) => context.fillRect(x, y, 150, 150));
    context.fillStyle = "#121214";
    context.font = "700 76px sans-serif";
    context.fillText("GRID 100", 615, 535);
  }
  return canvas;
}

async function sha256(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`文件返回 ${response.status}`);
  const digest = await crypto.subtle.digest("SHA-256", await response.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function quadInside(asset, quad) {
  return Array.isArray(quad) && quad.length === 4 && quad.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 && x <= asset.canvas.width && y <= asset.canvas.height);
}

async function runAutomaticChecks() {
  const asset = state.selected;
  const checks = {
    schema: false,
    renderer: false,
    dimensions: false,
    recommendedSize: false,
    geometry: false,
    aperture: false,
    seam: false,
    provenance: false,
    integrity: false
  };
  try { renderer.validateAsset(asset); checks.schema = true; } catch { /* listed below */ }
  checks.renderer = state.manifest.rendererVersion === renderer.VERSION;
  checks.dimensions = state.baseImage?.naturalWidth === asset.canvas.width && state.baseImage?.naturalHeight === asset.canvas.height;
  checks.recommendedSize = Number.isInteger(asset.screen?.recommendedSize?.width) && Number.isInteger(asset.screen?.recommendedSize?.height) && Boolean(asset.screen?.recommendedSize?.label);
  checks.geometry = quadInside(asset, state.quad);
  checks.aperture = quadInside(asset, state.apertureQuad)
    && Array.isArray(asset.screen?.aperture?.cornerRadii)
    && asset.screen.aperture.cornerRadii.length === 4
    && asset.screen.aperture.cornerRadii.every((radius) => Number.isFinite(radius) && radius >= 0 && radius <= 0.49);
  try {
    state.seamMetrics = renderer.screenCoverageMetrics(state.baseImage, asset);
    checks.seam = state.seamMetrics.pass === true;
  } catch {
    state.seamMetrics = null;
    checks.seam = false;
  }
  checks.provenance = asset.provenance?.kind === "generated-in-house";
  try {
    const [baseDigest, thumbnailDigest] = await Promise.all([sha256(resolveAsset(asset.layers.base)), sha256(resolveAsset(asset.thumbnail))]);
    checks.integrity = baseDigest === asset.integrity?.baseSha256 && thumbnailDigest === asset.integrity?.thumbnailSha256;
  } catch { checks.integrity = false; }
  state.automaticChecks = checks;
  renderChecks();
}

const checkLabels = {
  schema: "素材结构符合共享规范",
  renderer: "质检台与插件渲染器版本一致",
  dimensions: "源图尺寸与清单画布一致",
  recommendedSize: "推荐画面尺寸与比例已填写",
  geometry: "四个屏幕顶点均在画布内",
  aperture: "可见孔径与四角曲率独立且有效",
  seam: "接缝软边覆盖完整且未越过安全上限",
  provenance: "素材来源标记为项目自制",
  integrity: "基础图与缩略图哈希正确"
};

function renderChecks() {
  elements.automaticChecks.replaceChildren();
  const entries = Object.entries(checkLabels);
  const passed = entries.filter(([key]) => state.automaticChecks[key]).length;
  elements.automaticSummary.textContent = `${passed} / ${entries.length}`;
  for (const [key, label] of entries) {
    const row = document.createElement("div");
    row.className = `check-row${state.automaticChecks[key] ? " pass" : ""}`;
    const detail = key === "seam" && state.seamMetrics
      ? ` · 外延 ${state.seamMetrics.maxEdgeExtension}/${state.seamMetrics.edgeExtensionLimit}px · 截断率 ${(state.seamMetrics.truncatedEdgeRatio * 100).toFixed(2)}%`
      : "";
    row.innerHTML = `<i>${state.automaticChecks[key] ? "✓" : "·"}</i><span>${label}${detail}</span>`;
    elements.automaticChecks.appendChild(row);
  }
  updateApprovalState();
}

function renderPatternVisits() {
  const labels = { grid: "网格", landscape: "横屏", portrait: "竖屏", edge: "明暗边界" };
  elements.patternVisits.replaceChildren();
  for (const id of REQUIRED_PATTERNS) {
    const chip = document.createElement("span");
    chip.className = `visit-chip${state.visitedPatterns.has(id) ? " visited" : ""}`;
    chip.textContent = `${state.visitedPatterns.has(id) ? "✓" : "·"} ${labels[id]}`;
    elements.patternVisits.appendChild(chip);
  }
  elements.patternSummary.textContent = `${state.visitedPatterns.size} / ${REQUIRED_PATTERNS.length}`;
  updateApprovalState();
}

function manualValues() {
  return Object.fromEntries(MANUAL_KEYS.map((key) => [key, Boolean(document.querySelector(`[data-manual="${key}"]`)?.checked)]));
}

function updateApprovalState() {
  if (!state.selected) return;
  const automaticPass = Object.keys(checkLabels).every((key) => state.automaticChecks[key]);
  const patternsPass = REQUIRED_PATTERNS.every((id) => state.visitedPatterns.has(id));
  const manualPass = Object.values(manualValues()).every(Boolean);
  const ready = automaticPass && patternsPass && manualPass;
  elements.approveButton.disabled = !ready;
  elements.approvalTitle.textContent = state.approvedIds.has(state.selected.id) ? "当前版本已批准" : ready ? "已达到发布条件" : "尚未达到发布条件";
  elements.approvalHint.textContent = ready ? "批准后仍需通过发布脚本复制到正式库" : "先完成自动检查、四种测试图和人工验收";
}

function updateGeometryEditor() {
  if (!state.selected || !state.quad) return;
  elements.quadPolygon.setAttribute("points", state.quad.map((point) => point.join(",")).join(" "));
  const svg = elements.quadPolygon.ownerSVGElement;
  svg.setAttribute("viewBox", `0 0 ${state.selected.canvas.width} ${state.selected.canvas.height}`);
  for (const handle of elements.quadEditor.querySelectorAll("button")) {
    const [x, y] = state.quad[Number(handle.dataset.corner)];
    handle.style.left = `${x / state.selected.canvas.width * 100}%`;
    handle.style.top = `${y / state.selected.canvas.height * 100}%`;
  }
}

function renderComposite() {
  if (!state.selected || !state.baseImage) return;
  const asset = {
    ...state.selected,
    screen: {
      ...state.selected.screen,
      aperture: {
        ...state.selected.screen.aperture,
        quad: state.apertureQuad
      }
    }
  };
  renderer.renderComposite({
    canvas: elements.previewCanvas,
    asset,
    baseImage: state.baseImage,
    designImage: makePattern(state.pattern),
    fit: state.selected.screen.defaultFit || "cover",
    adjustments: renderer.DEFAULT_ADJUSTMENTS,
    quad: state.quad,
    layerImages: state.layerImages
  });
  updateGeometryEditor();
}

function renderAssetList() {
  elements.assetList.replaceChildren();
  for (const asset of state.manifest.items) {
    const button = document.createElement("button");
    button.className = `asset-card${state.selected?.id === asset.id ? " active" : ""}`;
    button.type = "button";
    button.dataset.assetId = asset.id;
    button.innerHTML = `<img src="${resolveAsset(asset.thumbnail)}" alt=""><div><strong>${asset.name}</strong><span>${asset.canvas.width} × ${asset.canvas.height}</span><em>${state.approvedIds.has(asset.id) ? "已批准" : "待质检"}</em></div>`;
    button.addEventListener("click", () => selectAsset(asset.id));
    elements.assetList.appendChild(button);
  }
}

async function selectAsset(id) {
  const asset = state.manifest.items.find((item) => item.id === id);
  if (!asset) return;
  state.selected = asset;
  state.quad = asset.screen.quad.map((point) => [...point]);
  state.apertureQuad = asset.screen.aperture.quad.map((point) => [...point]);
  state.visitedPatterns = new Set([state.pattern]);
  state.automaticChecks = {};
  state.seamMetrics = null;
  for (const input of document.querySelectorAll("[data-manual]")) input.checked = false;
  elements.assetName.textContent = asset.name;
  elements.assetMeta.textContent = `${asset.id} · r${asset.revision} · ${asset.renderer}`;
  elements.previewCanvas.width = asset.canvas.width;
  elements.previewCanvas.height = asset.canvas.height;
  renderAssetList();
  renderPatternVisits();
  renderChecks();
  try {
    state.baseImage = await loadImage(resolveAsset(asset.layers.base));
    const optional = await Promise.all(["reflection", "foreground"].map(async (name) => asset.layers[name] ? [name, await loadImage(resolveAsset(asset.layers[name]))] : [name, null]));
    state.layerImages = Object.fromEntries(optional.filter(([, image]) => image));
    renderComposite();
    await runAutomaticChecks();
  } catch (error) {
    toast(error.message || "样机加载失败");
  }
}

async function loadCatalog() {
  elements.libraryState.className = "status-dot";
  elements.libraryState.textContent = "正在连接测试库";
  try {
    const [manifestResponse, approvalsResponse] = await Promise.all([
      fetch(MANIFEST_URL, { cache: "no-store" }),
      fetch("/api/lab/approvals", { cache: "no-store" })
    ]);
    if (!manifestResponse.ok) throw new Error(`测试库返回 ${manifestResponse.status}`);
    state.manifest = await manifestResponse.json();
    if (approvalsResponse.ok) {
      const data = await approvalsResponse.json();
      state.approvedIds = new Set(data.approvals.filter((item) => item.current).map((item) => item.assetId));
    }
    elements.catalogVersion.textContent = state.manifest.catalogVersion;
    elements.assetCount.textContent = String(state.manifest.items.length);
    elements.libraryState.className = "status-dot online";
    elements.libraryState.textContent = "测试库已连接";
    renderAssetList();
    if (state.manifest.items[0]) await selectAsset(state.manifest.items[0].id);
  } catch (error) {
    elements.libraryState.className = "status-dot error";
    elements.libraryState.textContent = "测试库不可用";
    toast(error.message || "目录加载失败");
  }
}

for (const button of elements.patternTabs.querySelectorAll("button")) {
  button.addEventListener("click", () => {
    state.pattern = button.dataset.pattern;
    state.visitedPatterns.add(state.pattern);
    elements.patternTabs.querySelectorAll("button").forEach((item) => item.classList.toggle("active", item === button));
    renderPatternVisits();
    renderComposite();
  });
}

for (const input of document.querySelectorAll("[data-manual]")) input.addEventListener("change", updateApprovalState);

for (const handle of elements.quadEditor.querySelectorAll("button")) {
  handle.addEventListener("pointerdown", (event) => {
    state.draggingCorner = Number(handle.dataset.corner);
    handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener("pointermove", (event) => {
    if (state.draggingCorner !== Number(handle.dataset.corner) || !state.selected) return;
    const rect = elements.previewCanvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(state.selected.canvas.width, (event.clientX - rect.left) / rect.width * state.selected.canvas.width));
    const y = Math.max(0, Math.min(state.selected.canvas.height, (event.clientY - rect.top) / rect.height * state.selected.canvas.height));
    state.quad[state.draggingCorner] = [Math.round(x), Math.round(y)];
    state.apertureQuad[state.draggingCorner] = [Math.round(x), Math.round(y)];
    renderComposite();
    state.automaticChecks.geometry = quadInside(state.selected, state.quad);
    state.automaticChecks.aperture = quadInside(state.selected, state.apertureQuad);
    renderChecks();
  });
  handle.addEventListener("pointerup", () => { state.draggingCorner = null; });
}

elements.resetGeometryButton.addEventListener("click", () => {
  state.quad = state.selected.screen.quad.map((point) => [...point]);
  state.apertureQuad = state.selected.screen.aperture.quad.map((point) => [...point]);
  renderComposite();
  runAutomaticChecks();
});

elements.saveGeometryButton.addEventListener("click", async () => {
  if (!state.selected) return;
  const response = await fetch("/api/lab/geometry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      assetId: state.selected.id,
      quad: state.quad,
      apertureQuad: state.apertureQuad,
      cornerRadii: state.selected.screen.aperture.cornerRadii
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { toast(data.error || "坐标保存失败"); return; }
  state.selected.screen.quad = data.item.screen.quad.map((point) => [...point]);
  state.selected.screen.aperture = structuredClone(data.item.screen.aperture);
  toast("屏幕坐标已写回测试库");
});

elements.approveButton.addEventListener("click", async () => {
  const response = await fetch("/api/lab/approve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      assetId: state.selected.id,
      quad: state.quad,
      apertureQuad: state.apertureQuad,
      automaticChecks: state.automaticChecks,
      seamMetrics: state.seamMetrics,
      manualChecks: manualValues(),
      patternIds: [...state.visitedPatterns]
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { toast(data.error || "批准失败"); return; }
  state.approvedIds.add(state.selected.id);
  renderAssetList();
  updateApprovalState();
  toast("质检通过，可运行发布脚本进入正式库");
});

elements.reloadButton.addEventListener("click", loadCatalog);
loadCatalog();
