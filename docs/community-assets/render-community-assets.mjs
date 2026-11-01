import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'docs/community-assets/review');

const W = 1920;
const H = 1080;
const BG = '#F4F3EF';
const PAPER = '#FFFFFF';
const INK = '#151515';
const MUTED = '#666763';
const LINE = '#DDDCD7';
const RED = '#F04B43';
const FONT = "'PingFang SC','SF Pro Display','Helvetica Neue',Arial,sans-serif";

const assets = {
  bird: path.join(ROOT, 'plugin/assets/little-bird-mockup-logo-light-surface.png'),
  birdDark: path.join(ROOT, 'plugin/assets/little-bird-mockup-logo-dark-ui.png'),
  plugin: path.join(ROOT, 'docs/evidence/little-bird-mockup-brand-expanded.png'),
  edit: path.join(ROOT, 'docs/evidence/2026-10-29-final-c-edit.png'),
  perspective: path.join(ROOT, 'docs/evidence/2026-10-29-final-e-perspective.png'),
  laptop: path.join(ROOT, 'docs/evidence/2026-10-30-seam-laptop-export-v4.png'),
  phone: path.join(ROOT, 'docs/evidence/2026-10-30-aperture-rail-export.png'),
  studio: path.join(ROOT, 'catalog/production/v1/assets/studio-display-front-r3.png'),
  rock: path.join(ROOT, 'catalog/production/v1/assets/rock-phone-front-r3.png'),
  rail: path.join(ROOT, 'catalog/production/v1/assets/rail-phone-angle-r3.png'),
  graphite: path.join(ROOT, 'catalog/production/v1/assets/graphite-laptop-angle-r3.png'),
  workstation: path.join(ROOT, 'catalog/production/v1/assets/workstation-display-three-quarter-r3.png'),
};

const svg = (width, height, content, bg = 'none') => Buffer.from(`
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="${bg}"/>
  <style>
    text { font-family: ${FONT}; fill: ${INK}; }
    .muted { fill: ${MUTED}; }
    .white { fill: #fff; }
  </style>
  ${content}
</svg>`);

const roundedMask = (width, height, radius) => svg(width, height, `<rect width="${width}" height="${height}" rx="${radius}" fill="#fff"/>`);

async function image(pathname, width, height, fit = 'cover', position = 'centre', radius = 28) {
  const input = await sharp(pathname).resize(width, height, { fit, position }).png().toBuffer();
  return sharp(input).composite([{ input: roundedMask(width, height, radius), blend: 'dest-in' }]).png().toBuffer();
}

function cardShadow(x, y, width, height, radius = 30) {
  return `<defs><filter id="shadow-${x}-${y}" x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy="18" stdDeviation="24" flood-color="#101010" flood-opacity="0.12"/></filter></defs><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="#fff" filter="url(#shadow-${x}-${y})"/><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="#fff" stroke="${LINE}"/>`;
}

function label(x, y, text, width) {
  return `<rect x="${x}" y="${y}" width="${width}" height="60" rx="30" fill="#fff" stroke="${LINE}"/><circle cx="${x + 30}" cy="${y + 30}" r="8" fill="${RED}"/><text x="${x + 52}" y="${y + 40}" font-size="26" font-weight="650">${text}</text>`;
}

async function createIcon() {
  const bird = await sharp(assets.bird).trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } }).resize(104, 104, { fit: 'contain' }).png().toBuffer();
  const plate = svg(128, 128, '<rect x="2" y="2" width="124" height="124" rx="32" fill="#F4F3EF" stroke="#DDDCD7" stroke-width="2"/>');
  await sharp(plate).composite([{ input: bird, left: 12, top: 12 }]).png().toFile(path.join(OUT, 'plugin-icon-128.png'));
}

async function cover(icon) {
  const plugin = await image(assets.plugin, 900, 675, 'cover', 'centre', 24);
  const laptop = await image(assets.laptop, 430, 287, 'cover', 'centre', 22);
  const phone = await image(assets.phone, 330, 248, 'cover', 'centre', 22);
  const overlay = svg(W, H, `
    ${cardShadow(760, 76, 1090, 928, 36)}
    <text x="92" y="176" font-size="30" font-weight="650" class="muted">小鸟样机 · Figma 插件</text>
    <text x="92" y="318" font-size="84" font-weight="760"><tspan x="92" dy="0">把设计放进去，</tspan><tspan x="92" dy="104">一眼就像成品</tspan></text>
    <text x="92" y="584" font-size="34" font-weight="520" class="muted">精选设备样机 · 直接粘贴回 Figma</text>
    ${label(92, 682, '打开 Figma，马上试试', 365)}
    <rect x="802" y="116" width="1006" height="710" rx="28" fill="#181818"/>
    <rect x="792" y="826" width="484" height="164" rx="26" fill="#fff" stroke="${LINE}"/>
    <rect x="1296" y="826" width="512" height="164" rx="26" fill="#fff" stroke="${LINE}"/>
  `, BG);
  await sharp(overlay).composite([
    { input: icon, left: 92, top: 88 },
    { input: plugin, left: 802, top: 116 },
    { input: laptop, left: 820, top: 688 },
    { input: phone, left: 1450, top: 710 },
  ]).png().toFile(path.join(OUT, '01-cover.png'));
}

async function threeSteps(icon) {
  const choose = await image(assets.plugin, 500, 530, 'cover', 'west', 26);
  const edit = await image(assets.edit, 500, 530, 'cover', 'centre', 26);
  const done = await image(assets.laptop, 500, 530, 'cover', 'centre', 26);
  const overlay = svg(W, H, `
    <text x="180" y="102" font-size="30" font-weight="650" class="muted">小鸟样机</text>
    <text x="92" y="246" font-size="76" font-weight="760">三步，设计就能上样机</text>
    <text x="110" y="962" font-size="38" font-weight="700">01  选一个样机</text>
    <text x="710" y="962" font-size="38" font-weight="700">02  放入你的设计</text>
    <text x="1310" y="962" font-size="38" font-weight="700">03  完成，直接使用</text>
    <rect x="86" y="318" width="520" height="550" rx="32" fill="#fff" stroke="${LINE}"/>
    <rect x="686" y="318" width="520" height="550" rx="32" fill="#fff" stroke="${LINE}"/>
    <rect x="1286" y="318" width="520" height="550" rx="32" fill="#fff" stroke="${LINE}"/>
  `, BG);
  await sharp(overlay).composite([
    { input: icon, left: 92, top: 52 },
    { input: choose, left: 96, top: 328 },
    { input: edit, left: 696, top: 328 },
    { input: done, left: 1296, top: 328 },
  ]).png().toFile(path.join(OUT, '02-three-steps.png'));
}

async function adjust(icon) {
  const edit = await image(assets.edit, 1080, 750, 'cover', 'centre', 30);
  const overlay = svg(W, H, `
    ${cardShadow(88, 166, 1120, 806, 36)}
    <text x="1320" y="246" font-size="72" font-weight="760"><tspan x="1320" dy="0">画面怎么放，</tspan><tspan x="1320" dy="92">你说了算</tspan></text>
    <text x="1320" y="526" font-size="34" font-weight="540" class="muted"><tspan x="1320" dy="0">缩放 · 移动</tspan><tspan x="1320" dy="58">旋转 · 色彩</tspan></text>
    ${label(1320, 704, '不用切软件，直接在 Figma 里调', 500)}
  `, BG);
  await sharp(overlay).composite([
    { input: edit, left: 108, top: 186 },
    { input: icon, left: 1320, top: 94 },
  ]).png().toFile(path.join(OUT, '03-adjust.png'));
}

async function perspective(icon) {
  const shot = await image(assets.perspective, 1120, 780, 'cover', 'centre', 30);
  const overlay = svg(W, H, `
    <text x="180" y="112" font-size="30" font-weight="650" class="muted">自由透视</text>
    <text x="92" y="300" font-size="76" font-weight="760"><tspan x="92" dy="0">角度不对？</tspan><tspan x="92" dy="98">拖一拖就好</tspan></text>
    <text x="92" y="566" font-size="34" font-weight="540" class="muted"><tspan x="92" dy="0">四个角点自由调整</tspan><tspan x="92" dy="58">斜着放，也能贴得自然</tspan></text>
    ${cardShadow(708, 90, 1150, 900, 36)}
  `, BG);
  await sharp(overlay).composite([
    { input: icon, left: 92, top: 66 },
    { input: shot, left: 723, top: 105 },
  ]).png().toFile(path.join(OUT, '04-perspective.png'));
}

async function finish(icon) {
  const laptop = await image(assets.laptop, 720, 480, 'cover', 'centre', 28);
  const phone = await image(assets.phone, 620, 465, 'cover', 'centre', 28);
  const overlay = svg(W, H, `
    <text x="180" y="106" font-size="30" font-weight="650" class="muted">完成以后</text>
    <text x="92" y="268" font-size="76" font-weight="760">直接回到 Figma</text>
    <text x="92" y="344" font-size="34" font-weight="540" class="muted">粘贴回画布，或导出原始尺寸 PNG</text>
    <rect x="88" y="420" width="756" height="520" rx="34" fill="#fff" stroke="${LINE}"/>
    <rect x="876" y="420" width="656" height="520" rx="34" fill="#fff" stroke="${LINE}"/>
    <rect x="1564" y="420" width="268" height="520" rx="34" fill="#171717"/>
    <text x="1620" y="594" font-size="38" font-weight="700" class="white"><tspan x="1620" dy="0">无需</tspan><tspan x="1620" dy="58">登录</tspan></text>
    <line x1="1620" y1="738" x2="1776" y2="738" stroke="#4C4C4C"/>
    <text x="1620" y="818" font-size="38" font-weight="700" class="white"><tspan x="1620" dy="0">画面</tspan><tspan x="1620" dy="58">本地处理</tspan></text>
  `, BG);
  await sharp(overlay).composite([
    { input: icon, left: 92, top: 58 },
    { input: laptop, left: 106, top: 440 },
    { input: phone, left: 894, top: 440 },
  ]).png().toFile(path.join(OUT, '05-finish.png'));
}

async function contactSheet() {
  const files = ['01-cover.png', '02-three-steps.png', '03-adjust.png', '04-perspective.png', '05-finish.png'];
  const cover = await image(path.join(OUT, files[0]), 1180, 664, 'cover', 'centre', 22);
  const thumbs = await Promise.all(files.slice(1).map((f) => image(path.join(OUT, f), 430, 242, 'cover', 'centre', 18)));
  const overlay = svg(1920, 1240, `
    <text x="80" y="84" font-size="34" font-weight="700">小鸟样机 · Figma Community 宣传图候选</text>
    <rect x="62" y="116" width="1216" height="700" rx="28" fill="#fff" stroke="${LINE}"/>
    <rect x="1310" y="116" width="548" height="112" rx="24" fill="#fff" stroke="${LINE}"/>
    <text x="1346" y="166" font-size="24" font-weight="650">统一原则</text>
    <text x="1346" y="202" font-size="20" class="muted">真实界面 · 真实样机 · 真实功能</text>
    <rect x="1310" y="258" width="548" height="558" rx="28" fill="#FFFFFF" stroke="#DDDAD4" stroke-width="2"/>
    <text x="1350" y="342" font-size="28" font-weight="700">跨主题插件图标</text>
    <text x="1350" y="740" font-size="22" class="muted">128 × 128 px</text>
    <text x="64" y="884" font-size="28" font-weight="700">轮播图</text>
    ${[0,1,2,3].map((i) => `<rect x="${64 + i*462}" y="920" width="446" height="258" rx="22" fill="#fff" stroke="${LINE}"/>`).join('')}
  `, '#E9E8E3');
  const icon = await image(path.join(OUT, 'plugin-icon-128.png'), 280, 280, 'contain', 'centre', 40);
  await sharp(overlay).composite([
    { input: cover, left: 80, top: 134 },
    { input: icon, left: 1444, top: 394 },
    ...thumbs.map((input, i) => ({ input, left: 72 + i * 462, top: 928 })),
  ]).png().toFile(path.join(OUT, '00-review-contact-sheet.png'));
}

async function brandContextMatrix() {
  const dark38 = await sharp(assets.birdDark).resize(38, 38, { fit: 'contain' }).png().toBuffer();
  const dark44 = await sharp(assets.birdDark).resize(44, 44, { fit: 'contain' }).png().toBuffer();
  const light44 = await sharp(assets.bird).resize(44, 44, { fit: 'contain' }).png().toBuffer();
  const light72 = await sharp(assets.bird).resize(72, 72, { fit: 'contain' }).png().toBuffer();
  const listing = await sharp(path.join(OUT, 'plugin-icon-128.png')).resize(128, 128).png().toBuffer();
  const surface = svg(1280, 520, `
    <rect x="40" y="40" width="580" height="440" rx="28" fill="#171717"/>
    <rect x="660" y="40" width="580" height="440" rx="28" fill="#F4F3EF" stroke="#DDDCD7"/>
    <text x="80" y="104" font-size="26" font-weight="700" class="white">插件深色界面</text>
    <text x="700" y="104" font-size="26" font-weight="700">Figma 广场浅色界面</text>
    <text x="80" y="430" font-size="20" class="white">38px / 44px：眼睛、嘴、腿保持可见</text>
    <text x="700" y="430" font-size="20">44px / 72px / 128px：深色细节保持可见</text>
  `, '#E9E8E3');
  await sharp(surface).composite([
    { input: dark38, left: 100, top: 206 },
    { input: dark44, left: 238, top: 203 },
    { input: light44, left: 720, top: 203 },
    { input: light72, left: 860, top: 189 },
    { input: listing, left: 1020, top: 161 },
  ]).png().toFile(path.join(OUT, '00-brand-context-matrix.png'));
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  await createIcon();
  await brandContextMatrix();
  const promotionMark = await sharp(assets.bird).resize(72, 72, { fit: 'contain' }).png().toBuffer();
  await cover(promotionMark);
  await threeSteps(promotionMark);
  await adjust(promotionMark);
  await perspective(promotionMark);
  await finish(promotionMark);
  await contactSheet();
}

await main();
