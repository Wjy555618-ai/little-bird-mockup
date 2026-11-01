# 架构与资产更新策略

## 主目标

插件发布后，样机素材可以独立增加、替换和回滚，不需要为了每次素材更新重新审核 Figma Community 插件；同时保证质检台通过的结果在插件里使用同一套代码渲染。

远程数据平面、控制平面、供应商解耦、发布顺序、故障降级和上线门禁的唯一权威合同为 `docs/REMOTE_CATALOG_ARCHITECTURE_CONTRACT_2026-10-31.md`。本文描述实现结构，不得扩大该合同只授权的 Netlify 阶段零静态白名单试运行，也不得绕过长期供应商选择门禁。

## 一套内核，两个使用界面，两个资产环境

```text
素材制作
   ↓
测试库 catalog/testing
   ↓  同一 MockupRenderer
样机质检台 ──批准报告──→ promote-mockup.mjs
                            ↓
                    正式库 catalog/production
                            ↓
                    Figma 插件读取并合成
```

### 共享渲染器

`shared/mockup-renderer.js` 是唯一的合成实现，当前版本为 `2.4.0`。它负责：

- contain、cover 两种保持原比例的适配；不再提供会导致非等比变形的 stretch；
- 先按 `recommendedSize` 建立设备真实屏幕比例，再映射到样机四边形，避免把透视后的窄宽度重复当成源文件比例；
- 缩放、位移、旋转、亮度、对比度和饱和度；
- 矩形或任意四边形透视；
- 独立的内容映射面、物理可见孔径、遮挡、反射层和前景层；
- 只依据显式几何进行孔径遮罩与透视映射，不读取像素颜色来推断屏幕边界。

用户编辑使用三个职责明确的几何对象：物理开口只描述样机结构，`contentFrame` 描述可移动、可缩放的内容/裁切边界，`imageFrame` 描述来源图在该边界后的变换。`contentFrame` 旋转后的四角始终被硬限制在物理开口内。`contentGeometry()` 同时产生渲染和交互使用的 `renderQuad` / `overlayQuad`；最终用户像素也严格裁剪在这组点内。普通移动或缩放变换内容框；满屏框无法继续移动时改为平移其后的来源图。裁切模式只变换 `contentFrame`，让来源保持静止。视口 CSS 像素先映射回 manifest 逻辑画布，DPR 只负责逻辑画布到 backing store 的最后映射，不进入编辑状态。

插件构建时将该文件注入 `plugin/ui.html`；质检台直接引用同一个文件。manifest 还声明 `rendererVersion`，版本不一致时自动检查不通过。

### 样机质检台

`asset-lab/` 只服务素材制作和发布，不是面向普通用户的第二个 Figma 插件。它读取测试库，并提供：

- 可拖动的四角坐标编辑器；
- 网格、横屏、竖屏、明暗边界 4 种测试画面；
- 10 项自动检查：数据结构、渲染器版本、源图尺寸、推荐画面尺寸、内容坐标、可见孔径、完整底图、零色键字段、来源声明、文件哈希；
- 5 项人工检查：画框贴合、透视自然、边缘无穿帮、清晰度合格、四种画面均已检查；
- 只有全部通过后才能写入批准报告。

### 测试库与正式库

- `catalog/testing/v1`：制作中的样机，插件开发态和质检台使用。
- `catalog/production/v1`：只接受拥有当前有效批准报告的样机，未来线上插件使用。
- `scripts/promote-mockup.mjs`：验证报告中的 item 摘要、revision 和 rendererVersion，再复制素材、报告和元数据。
- `netlify.toml`：构建后只发布 `dist/netlify-catalog`。这个目录由当前活动 revision 的 manifest、底图、缩略图和安全响应头严格生成；历史 revision、批准记录、测试库、质检台、参考图和插件源码均不得进入部署候选。

## 静态样机数据契约 v5

```json
{
  "id": "studio-display-front",
  "revision": 2,
  "status": "testing",
  "renderer": "static-screen-v5",
  "canvas": { "width": 1448, "height": 1086 },
  "screen": {
    "quad": [[260, 185], [1190, 185], [1190, 702], [260, 702]],
    "recommendedSize": { "width": 1920, "height": 1080, "label": "16:9" },
    "aperture": {
      "quad": [[260, 185], [1190, 185], [1190, 702], [260, 702]],
      "cornerRadii": [0, 0, 0, 0]
    },
    "compositing": { "mode": "aperture-mask" },
    "defaultFit": "contain"
  },
  "layers": {
    "base": "assets/studio-display-front-r2.png"
  },
  "provenance": {
    "kind": "generated-in-house",
    "usage": "candidate",
    "presentationState": "complete"
  },
  "integrity": {
    "baseSha256": "...",
    "thumbnailSha256": "..."
  }
}
```

### 单一环境配置与生成式制品

`config/plugin.config.json` 是插件版本、开发/试运行/生产目录、Figma plugin ID、目录 schema、缓存版本/离线时限、渲染器版本，以及目录项数、响应字节、本地文件和Figma多选导出的资源上限的唯一事实源。`plugin/ui.js`、`plugin/code.template.js` 只保留构建令牌，`plugin/manifest.template.json` 只保留不随环境变化的静态字段；`scripts/build-plugin.mjs` 根据明确的 `development`、`pilot` 或 `production` 模式生成 UI、main code 和 manifest。`pilot` 使用与日常开发、正式发布均不同的专用本地插件身份，并强制读取与 production 配置相同的精确 HTTPS manifest；它只用于真实线上闭环验证，不是正式发布制品。

开发模式只能读取 localhost 上的 testing 目录。生产模式必须使用真实 HTTPS 域名、非全零正式 ID，并且不会输出 `devAllowedDomains`；IP、localhost、保留测试顶级域以及 `example.com/.net/.org` 及其子域均不是有效生产目标。源码、配置、manifest、PDF 主包与 worker、依赖锁文件、共享渲染器和精确构建令牌清单全部进入 12 位构建指纹；生产制品使用 `REL-`，开发制品使用 `DEV-`。`scripts/verify-release.mjs` 还要求干净提交、非本地非保留域名的 origin 远端，以及已发布到origin且解析到当前提交的版本标签；构建完成后再次确认HEAD和工作区未变化。生产URL有效时，远程manifest必须在禁止重定向和流式字节上限下与本地正式manifest逐字一致。

`pnpm release:package` 会先在临时目录重建并校验正式插件，再把带 `release-provenance.json` 和 `catalog-manifest.json` 的完整目录原子写入 `dist/plugin`。provenance 绑定版本、标签提交、合同 ID 与合同文件 SHA-256、测量政策摘要、REL 指纹、确定性制品摘要和正式目录版本/字节摘要；临时包和原子重命名前的暂存包都会重新验真，目标目录已存在时拒绝覆盖。后续人工证据从这个包生成默认 `NOT_RUN` 的草稿，并按机器合同指定的精确路径、场景断言、附件字节数/SHA-256和分子分母算术验真。

`screen.quad` 是内容映射与编辑坐标，`screen.aperture.quad` 是机身物理可见开口，二者都按左上、右上、右下、左下排列。`screen.aperture.cornerRadii` 依次记录四角曲率，比例基于透视前画面的短边。`screen.compositing.mode` 在 v5 中只能是 `aperture-mask`；底图和缩略图在未叠加用户内容时已经必须是完整可展示样机。运行时先原样绘制完整底图，再把用户内容按显式四边形透视并裁剪进孔径；不允许 `chromaKey`、`underlap`、`maxEdgeExtension` 或任何按像素颜色识别边界的兼容路径。`screen.recommendedSize` 描述用户内容在进入透视映射前的真实画面比例，也是插件显示给用户的推荐尺寸。可选 `layers.reflection` 和 `layers.foreground` 会在共享渲染器中按固定顺序叠加。

## 发布闸门

一个样机只有同时满足以下条件，才允许进入正式库：

1. manifest schema、rendererVersion、画布尺寸和四角坐标有效；
2. 素材与缩略图 SHA-256 与清单一致；
3. 来源声明为项目自制或后续明确允许的合法来源；
4. 4 种测试画面已经逐一打开检查；
5. 5 项人工质量检查全部确认；
6. 批准报告的 item 摘要与当前 manifest 完全一致；
7. 显式孔径指标通过，活动 schema 与运行时代码不存在色键路径；高占比绿色自动标为疑似占位板，只有绑定准确候选 SHA 的人类视觉批准才能把合法自然绿色完整画面消歧放行；
8. 发布脚本复制后，正式库再次通过 `catalog-release.mjs --check`。

坐标、图层、素材路径、哈希或其他条目内容一旦改变，批准报告自动过期，不能沿用旧结论。当前 v5 只接收完整底图和显式孔径几何；旧 r1 色键资产保留为历史文件，但不在任何活动 manifest 中，也不能通过本地素材服务访问。

## 插件运行时

- 只访问构建时编译进 manifest 的固定域名；正式版读取正式库。目录的 environment、schemaVersion、rendererVersion、minimumPluginVersion、素材状态、来源、完整性摘要和正式质检元数据任一不匹配都会被拒绝。
- 成功拉取后，主线程把 manifest 写入 Figma `clientStorage`。
- 网络失败时读取最后一次成功版本，并明确显示离线状态。
- 不执行任何远程 JavaScript，只读取 JSON 和媒体文件。
- 目录最多500项、JSON最多2MiB、单个远程素材最多32MiB；流式响应一旦越界立即取消。目录只接收目录内相对素材路径，拒绝绝对URL、查询、锚点和父目录穿越。
- 支持搜索、分类、相似与最近使用；显式分类优先于“相似”的当前样机分类，避免互斥筛选得到错误空结果。
- Figma 画框、组件、容器、组合、矢量、图片及多选图层统一导出并合成为一个静态画面对象；一次最多50层，按层串行导出且累计不超过80MiB，避免无界并发内存尖峰。导入到 Figma 的 SVG、PDF 或视频节点也沿用这条路径。
- 本地文件支持 PNG、JPG、WebP、SVG、MP4、WebM、MOV 和 PDF；视频取可见静态帧，PDF 当前取第 1 页，符合本项目静态样机输出边界。
- 画面默认保持原比例，可在预览中直接拖动，并通过四角与四边共 8 个控制点等比缩放；内容框和裁切框的旋转四角都不得越出物理开口。双击后移动或缩放裁切边界，来源图保持静止；样机四边形透视角点限制在物理开口的 UV 范围内。
- 内容命中区主键手势始终归画面对象：第一次拖动即选中并移动，8 个手柄始终缩放，双击进入可移动裁切框。舞台导航只由空白舞台主键拖动、Space 拖动、中键拖动、鼠标滚轮或触控板双指平移、`Ctrl/⌘ + 滚轮` 捏合缩放和一键适应触发；不得再用位移阈值把内容首拖升级成舞台平移。
- 顶部“添加画面 / 换画面”统一读取 Figma 选区和导入本地文件；切换样机保留当前画面来源，但会按新样机屏幕重建默认原图变换；复位统一恢复调整、原图变换、透视、裁切临时态和舞台视图。
- 窗口可在 `820 × 600` 工作态和 `320 × 64` 收起态之间切换。

## 缓存、原子更新与回滚

- manifest 禁止长期缓存；带 revision 的图片可设置 immutable 长缓存。
- 离线目录必须来自当前构建的同一 manifest URL，并且缓存时间不得超过单一配置声明的 168 小时；跨环境、跨域或过期缓存会被拒绝。
- 高清素材缓存使用最多 8 项的 LRU；后台只预取当前样机附近最多 3 项，不再随目录增长全量预加载。
- 部署顺序必须是“先上传新 revision 素材，再原子替换 manifest”；同名revision若字节不同会硬失败，不能覆盖不可变资源。
- 每次正式目录变更前自动把当前manifest保存到 `catalog-history/production/<catalogVersion>/manifest.json`；回滚先验证快照及素材SHA-256，默认只演练，显式 `--apply` 后恢复旧内容但发布为新的单调 `catalogVersion`。
- Figma 发布时会限制联网域名，因此生产域名固定后只更新该域名下的资产内容。

## 能力边界

当前闭环只做静态样机。视频支持指“读取静态帧”，不是动态视频播放或动图导出；PDF 当前读取第 1 页。真实 3D 场景仍不在当前能力范围内。UI 可以参考目标产品的结构与交互密度，但代码、素材、品牌和内容均为本项目自有实现，不复制第三方 Pro 素材或代码。
