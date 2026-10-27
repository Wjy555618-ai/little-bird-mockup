# 样机工作室（开发代号）

一个中文优先、样机资产与插件版本解耦的 Figma 样机工具。当前里程碑只保留 **4 个临时测试样机**，目标是验证“制作素材 → 质检 → 发布到正式库 → 插件读取 → Figma 写回”的完整闭环，不把测试素材当作最终内容库。

## 当前交付由什么组成

- **Figma 插件**：把 Figma 选区或本地文件统一成一个静态画面对象，按样机推荐尺寸保持原比例，支持预览内拖动、等比缩放、色彩、透视、导出和写回画布。
- **样机质检台**：在素材进入正式库前，用与插件完全相同的渲染器检查坐标、边缘、透视、尺寸、来源和文件完整性。
- **测试库与正式库**：新素材先进入 `catalog/testing`；质检批准后由脚本复制到 `catalog/production`。正式插件只应读取正式库。
- **共享渲染器**：插件与质检台都使用 `shared/mockup-renderer.js`，避免出现“质检台看起来正确、插件结果不同”的两套实现。

## 已验证的真实链路

当前 4 个临时样机均完成以下流程：

1. 测试库载入成功，7 项自动检查通过，其中包含每个样机的推荐画面尺寸与比例。
2. 在质检台逐一查看网格、横屏、竖屏、明暗边界 4 种测试图，并完成人工确认。
3. 质检报告写入 `catalog/testing/v1/approvals`。
4. 发布脚本校验报告未过期后，将样机及报告提升到正式库。
5. 插件读取 4 个样机，完成搜索、分类、相似、最近使用、画面调整、透视、导出和粘贴流程。
6. 在 Figma 桌面端实际读取 `Frame 2`，依次渲染 4 个样机，并写回一个 `1200 × 800` 的样机图层。
7. 插件窗口在真实 Figma 中完成 `820 × 600` 展开态与 `320 × 64` 收起态切换。

素材服务不可用时，插件会从 Figma `clientStorage` 读取上次成功同步的目录，并明确显示“使用离线目录”。

## 当前 4 个临时样机

- 工作室显示器 · 正面
- 岩石手机 · 正面
- 支架手机 · 倾斜
- 石墨笔记本 · 倾斜

它们只用于测试渲染与发布机制，均标记为 `temporary-test`。后续可以全部删除并换成正式批量素材，插件代码不需要因此发新版本。

## 本地运行

本机 Node 不在系统 PATH 时，使用 Codex 自带运行时：

```bash
/Users/wangzhentao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/serve-catalog.mjs
```

服务默认运行在 `http://127.0.0.1:4173`：

- `http://127.0.0.1:4173/lab`：样机质检台
- `http://127.0.0.1:4173/preview`：插件浏览器预览
- `http://127.0.0.1:4173/catalog/testing/v1/manifest.json`：测试库
- `http://127.0.0.1:4173/catalog/production/v1/manifest.json`：正式库

然后在 Figma 的“插件 → 开发”中导入 [`plugin/manifest.json`](plugin/manifest.json)。开发态插件目前读取本地测试库，便于制作和调试。

## 新增或更新样机的标准流程

1. 把带 revision 的素材放入 `catalog/testing/v1/assets`，并更新测试库 manifest。
2. 运行测试库结构检查：`npm run catalog:check:testing`。
3. 打开 `/lab`，逐个样机完成自动检查、4 种测试图和 5 项人工检查。
4. 在质检台点击“批准当前样机”，生成带素材摘要的批准报告。
5. 运行 `npm run catalog:promote -- --id <assetId>`；全部提升仅用于明确的批量操作：`--all`。
6. 运行 `npm run check`，部署 `catalog/production`。插件刷新目录即可看到更新，不需要重新上传 Figma 插件。

任何坐标或素材内容发生变化，原批准报告都会因摘要不匹配而失效，必须重新质检。

## 正式发布前仍需完成

- 当前资产库只保存在本机，**尚未部署到 Netlify 或其他线上静态服务**。
- `plugin/ui.js` 中的正式目录 URL 仍是占位地址；部署后用 `npm run catalog:bind -- https://<domain>/v1/manifest.json` 同步插件 URL 与 Figma 允许域名。
- `plugin/manifest.json` 仍使用开发占位 ID；发布 Figma Community 前需要换成 Figma 分配的正式插件 ID。
- 当前 4 个素材是临时测试资产，不能代表正式样机库的数量与最终质量。

## Git 原则

工程按可验证里程碑提交。测试库、批准报告、正式库与插件代码可以追溯；不把未测试功能或未部署状态表述为已完成。
