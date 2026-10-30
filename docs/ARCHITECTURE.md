# 架构与资产更新策略

## 主目标

插件发布后，样机素材可以独立增加、替换和回滚，不需要为了每次素材更新重新审核 Figma Community 插件；同时保证质检台通过的结果在插件里使用同一套代码渲染。

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

`shared/mockup-renderer.js` 是唯一的合成实现，当前版本为 `2.3.0`。它负责：

- contain、cover 两种保持原比例的适配；不再提供会导致非等比变形的 stretch；
- 先按 `recommendedSize` 建立设备真实屏幕比例，再映射到样机四边形，避免把透视后的窄宽度重复当成源文件比例；
- 缩放、位移、旋转、亮度、对比度和饱和度；
- 矩形或任意四边形透视；
- 独立的内容映射面、物理可见孔径、接缝覆盖层、隐藏欠压、遮挡、反射层和前景层；
- 临时测试素材的绿幕清理。

插件构建时将该文件注入 `plugin/ui.html`；质检台直接引用同一个文件。manifest 还声明 `rendererVersion`，版本不一致时自动检查不通过。

### 样机质检台

`asset-lab/` 只服务素材制作和发布，不是面向普通用户的第二个 Figma 插件。它读取测试库，并提供：

- 可拖动的四角坐标编辑器；
- 网格、横屏、竖屏、明暗边界 4 种测试画面；
- 9 项自动检查：数据结构、渲染器版本、源图尺寸、推荐画面尺寸、内容坐标、可见孔径、接缝像素证据、来源声明、文件哈希；
- 5 项人工检查：画框贴合、透视自然、边缘无穿帮、清晰度合格、四种画面均已检查；
- 只有全部通过后才能写入批准报告。

### 测试库与正式库

- `catalog/testing/v1`：制作中的样机，插件开发态和质检台使用。
- `catalog/production/v1`：只接受拥有当前有效批准报告的样机，未来线上插件使用。
- `scripts/promote-mockup.mjs`：验证报告中的 item 摘要、revision 和 rendererVersion，再复制素材、报告和元数据。
- `netlify.toml`：未来只发布 `catalog/production`，不会暴露测试库、质检台或插件源码。

## 静态样机数据契约 v4

```json
{
  "id": "studio-display-front",
  "revision": 1,
  "status": "testing",
  "renderer": "static-screen-v4",
  "canvas": { "width": 1448, "height": 1086 },
  "screen": {
    "quad": [[260, 185], [1190, 185], [1190, 702], [260, 702]],
    "recommendedSize": { "width": 1920, "height": 1080, "label": "16:9" },
    "aperture": {
      "quad": [[260, 185], [1190, 185], [1190, 702], [260, 702]],
      "cornerRadii": [0, 0, 0, 0]
    },
    "compositing": {
      "mode": "chroma-edge",
      "maxEdgeExtension": 12
    },
    "underlap": 16,
    "defaultFit": "contain"
  },
  "layers": {
    "base": "assets/studio-display-front-r1.png"
  },
  "provenance": {
    "kind": "generated-in-house",
    "usage": "temporary-test"
  },
  "integrity": {
    "baseSha256": "...",
    "thumbnailSha256": "..."
  }
}
```

`screen.quad` 是内容映射与编辑坐标，`screen.aperture.quad` 是机身物理可见开口，二者都按左上、右上、右下、左下排列。`screen.aperture.cornerRadii` 依次记录四角曲率，比例基于透视前画面的短边。`screen.compositing` 要求渲染器从原始绿幕边缘测出每条边仍与开口连续的栅格软边，并把结果转换为一张平滑的矢量覆盖层；该覆盖层只负责消除栅格接缝，不改写物理孔径。`screen.underlap` 是覆盖层下方的隐藏内容余量，必须不小于接缝检测上限，不能再承担可见开口含义。`screen.recommendedSize` 描述用户内容在进入透视映射前的真实画面比例，也是插件显示给用户的推荐尺寸。可选 `layers.reflection` 和 `layers.foreground` 会在共享渲染器中按固定顺序叠加。复杂度继续通过数据契约扩展，不能在质检台和插件中分别增加两套特例。

## 发布闸门

一个样机只有同时满足以下条件，才允许进入正式库：

1. manifest schema、rendererVersion、画布尺寸和四角坐标有效；
2. 素材与缩略图 SHA-256 与清单一致；
3. 来源声明为项目自制或后续明确允许的合法来源；
4. 4 种测试画面已经逐一打开检查；
5. 5 项人工质量检查全部确认；
6. 批准报告的 item 摘要与当前 manifest 完全一致；
7. 接缝检测四边均未超出上限、截断样本为 0、开口内部绿幕覆盖率不低于 85%；
8. 发布脚本复制后，正式库再次通过 `catalog-release.mjs --check`。

坐标、图层、素材路径、哈希或其他条目内容一旦改变，批准报告自动过期，不能沿用旧结论。当前 v4 只接收能够由绿幕边缘提供可测证据的素材；没有可验证屏幕区域的任意位图会被拒绝，而不是带着未知接缝进入正式库。

## 插件运行时

- 只访问 manifest 中声明过的固定域名；正式版读取正式库。
- 成功拉取后，主线程把 manifest 写入 Figma `clientStorage`。
- 网络失败时读取最后一次成功版本，并明确显示离线状态。
- 不执行任何远程 JavaScript，只读取 JSON 和媒体文件。
- 支持搜索、分类、相似与最近使用；显式分类优先于“相似”的当前样机分类，避免互斥筛选得到错误空结果。
- Figma 画框、组件、容器、组合、矢量、图片及多选图层统一导出并合成为一个静态画面对象；导入到 Figma 的 SVG、PDF 或视频节点也沿用这条路径。
- 本地文件支持 PNG、JPG、WebP、SVG、MP4、WebM、MOV 和 PDF；视频取可见静态帧，PDF 当前取第 1 页，符合本项目静态样机输出边界。
- 画面默认保持原比例，可在预览中直接拖动，并通过四角与四边共 8 个控制点等比缩放；样机四边形透视由模板统一完成。
- 预览舞台支持背景拖动平移、鼠标滚轮或触控板双指平移、`Ctrl/⌘ + 滚轮` 捏合缩放和一键适应；舞台导航与画面对象调整互不抢占。
- 顶部“添加画面 / 换画面”统一读取 Figma 选区和导入本地文件；切换样机保留当前画面，复位只恢复当前样机的调整、透视和舞台视图。
- 窗口可在 `820 × 600` 工作态和 `320 × 64` 收起态之间切换。

## 缓存、原子更新与回滚

- manifest 禁止长期缓存；带 revision 的图片可设置 immutable 长缓存。
- 部署顺序必须是“先上传新 revision 素材，再原子替换 manifest”。
- manifest 保留 `catalogVersion`；出错时可以把入口恢复到上一版本，不改插件。
- Figma 发布时会限制联网域名，因此生产域名固定后只更新该域名下的资产内容。

## 能力边界

当前闭环只做静态样机。视频支持指“读取静态帧”，不是动态视频播放或动图导出；PDF 当前读取第 1 页。真实 3D 场景仍不在当前能力范围内。UI 可以参考目标产品的结构与交互密度，但代码、素材、品牌和内容均为本项目自有实现，不复制第三方 Pro 素材或代码。
