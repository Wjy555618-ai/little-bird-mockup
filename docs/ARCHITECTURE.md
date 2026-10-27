# 架构与更新策略

## 目标

发布一次插件，持续更新样机。插件不包含完整素材库，也不依赖每次重新审核 Figma Community 版本。

## 两层结构

### 1. 插件运行时

- 固定版本的 UI、合成引擎和 Figma 写回逻辑。
- 只访问 manifest 中声明过的长期素材域名。
- 启动时请求目录清单；请求失败时使用本地缓存，并明确显示离线状态。
- 识别清单 `schemaVersion`，遇到不支持的新版本时停止解析，避免静默渲染错误。

### 2. 素材目录

- `catalog/v1/manifest.json`：可搜索的样机元数据和文件 URL。
- `assets/`：背景、前景、高光、遮挡、3D 模型等正式资源。
- `thumbnails/`：列表缩略图。
- 每个条目有不可变 `id`、递增 `revision`、资源哈希和最低插件版本。
- 更新采用“先上传带哈希文件，再原子替换 manifest”的顺序，避免用户读到半套资源。

## 静态样机数据契约

```json
{
  "id": "studio-display-front",
  "revision": 1,
  "renderer": "static-screen-v1",
  "canvas": { "width": 1448, "height": 1086 },
  "screen": {
    "quad": [[260, 185], [1190, 185], [1190, 702], [260, 702]]
  },
  "layers": {
    "base": "assets/studio-display-front.png"
  }
}
```

首版支持矩形和任意四边形屏幕区域。复杂样机后续增加前景遮挡层、屏幕反射层和颜色参数，但保持旧 renderer 继续可用。

## 为什么不用一个可随意填写的素材 URL

Figma 插件发布时会展示并限制联网域名。让用户任意填写 URL 会扩大权限和供应链风险。正确做法是固定我们控制的域名，只让清单内容变化。Figma 官方 manifest 支持生产 `allowedDomains` 与开发 `devAllowedDomains`。

## 缓存与回滚

- 成功拉取后将 manifest 写入 `localStorage`。
- 网络失败时读取最后一次成功版本，并显示“离线目录”。
- manifest 保留 `catalogVersion`；素材发布出错时，把入口指回上一版清单即可回滚，不需要改插件。
- 插件永远不执行远程脚本，只读取 JSON 和媒体文件。

## 明确不做

- 不复制第三方插件代码或 Pro 素材。
- 不让远程目录下发可执行 JavaScript。
- 不把尚未实现的 Live/3D 功能做成假按钮成功态。
- 不声明与第三方产品 100% 一致。

