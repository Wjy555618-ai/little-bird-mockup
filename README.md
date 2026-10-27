# 样机工作室（开发代号）

一个中文优先、素材与插件解耦的 Figma 样机插件。插件负责读取 Figma 选区、渲染样机和写回画布；样机内容由独立远程目录提供，因此新增样机不需要重新发布插件。

## 当前已验证链路

以下链路已在 Figma 桌面端真实跑通：

1. 插件从远程 `manifest.json` 拉取样机目录。
2. 用户在 Figma 中选择一个图层或画框。
3. 插件导出选区并放入样机屏幕区域。
4. 用户将合成结果粘贴回 Figma。
5. 素材目录新增条目后，插件刷新即可看到，不需要重新发版。

素材服务不可用时，插件会从 Figma `clientStorage` 读取上次成功同步的目录，并明确显示“使用离线目录”。

当前版本围绕一条真实主流程收敛：选择远程目录中的样机，读取 Figma 选区或导入本地图片，调整填充、缩放、位置、旋转与色彩，必要时拖动四角编辑透视，然后导出 PNG 或写回 Figma 画布。与这条流程无关、尚不能兑现的动态和 3D 入口已删除，不保留假功能占位。

## 窗口与界面

- 默认窗口为 `820 × 600`，保留 Figma 左右面板和部分画布的可见空间。
- 点击顶部收起按钮后，窗口会真实缩小为 `320 × 64`；点击“展开”恢复工作区，而不是只隐藏内部内容。
- 展开态右下角支持拖拽调整尺寸，范围限制在 `820–1180 × 600–820`，避免界面被压坏或无限覆盖画布。
- 界面结构以目标 Mockup 插件截图为基准：顶部模式栏、左侧双列素材库或调整面板、右侧预览区、底部组合操作栏；素材、品牌与实现代码均为本项目自有内容。
- 顶部模式只保留真实可用的“样机 / 画面调整 / 透视编辑”；后续功能继续复用同一套深色、中性、紧凑的视觉令牌。

## 本地运行素材服务

本机 Node 不在系统 PATH 时，使用 Codex 自带运行时：

```bash
/Users/wangzhentao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/serve-catalog.mjs
```

服务默认运行在 `http://localhost:4173`。然后在 Figma 的“开发”菜单中导入 [`plugin/manifest.json`](plugin/manifest.json)。

## 素材发布流程

`catalog/` 是独立静态站点，[`netlify.toml`](netlify.toml) 只发布这个目录。`manifest.json` 禁止缓存，带 revision 的图片长期不可变缓存，因此更新时不会出现“新清单配旧图片”。

1. 将新图片以 `-rN` 文件名放入 `assets/` 和 `thumbnails/`，再编辑 manifest。
2. 运行 `npm run catalog:release -- --version YYYY.MM.DD.N`，校验坐标、路径和分类，并重算全部 SHA-256。
3. 运行 `npm run check`。
4. 原子部署 `catalog/`。插件刷新后即可读取新清单，无需重新发布插件。
5. 第一次部署后运行 `npm run catalog:bind -- https://<site>/v1/manifest.json`，它会同时绑定插件 URL 和 Figma 允许域名，避免两处配置漂移。

## 发布前必须替换

`plugin/ui.js` 中的 `PRODUCTION_CATALOG_URL` 目前是占位地址，`ACTIVE_CATALOG_URL` 仍指向本地开发服务。正式发布前需先部署上述静态目录，再使用 `catalog:bind` 一次性同步 URL 和 `allowedDomains`。域名固定后，后续只更新该域名下的清单与素材即可。

`plugin/manifest.json` 当前使用开发占位 ID；发布到 Figma Community 前还需替换成 Figma 分配的正式插件 ID。

## Git 节点

工程按可验证里程碑提交：架构、真实替换链路、视觉/测试。不要把未完成入口描述成已实现功能。

