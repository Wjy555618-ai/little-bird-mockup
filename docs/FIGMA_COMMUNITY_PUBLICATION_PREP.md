# 小鸟样机 Figma Community 上架准备

核对日期：2026-11-01
生命周期：`UNPUBLISHED`
当前状态：`PUBLICATION_AUTHORIZED`——工程开发门禁、品牌权利确认、用户冻结的上架材料、公开支持/安全入口和正式 Figma plugin ID 已完成；决定人已授权公开 GitHub 与最终 Figma Publish。正式 REL 制品与发布级验证仍待完成。

本文件只记录已经由代码、现有合同或决定人明确决定的发布事实。2026-11-01，决定人 Wang Zhentao 已明确授权创建公开 GitHub 仓库、配置 Issues 与私密漏洞报告、提交 Figma 审核，并在发布门禁通过后执行最终 Publish；账号登录、验证码和双重验证仍由决定人本人完成。

## 1. 决定人冻结、最后共同处理的材料

以下内容已于 2026-11-01 由决定人 Wang Zhentao 确认并冻结：

- Community 插件图标：透明背景、白色眼睛、黑色鸟嘴和黑色双腿的最终小鸟形象，`128 × 128`。
- `1920 × 1080` 主缩略图及四张轮播图。
- 已确认的 Tagline、详细说明、标签及其他推广文案。

首发已明确使用四张轮播图，不添加视频。所有发布字段的机器可读单一事实源为 [`config/figma-community.json`](../config/figma-community.json)；本文件只解释决定、依据与边界。

## 2. 已确定的发布字段

| 字段 | 结论 | 依据与边界 |
|---|---|---|
| 名称 | `小鸟样机` | manifest 单一品牌名称 |
| 产品形式 | Classic plugin | 当前 Figma 插件结构 |
| 编辑器 | Figma Design | `editorType: ["figma"]`；不宣称支持 FigJam、Slides、Buzz 或 Dev Mode |
| 首发价格 | 免费 | 决定人已明确先跑通免费插件；付费与团队私有样机后移 |
| 分类 | `Design tools` → `Product and brand` | 核心任务是将设计画面应用到产品样机场景；不是软件开发工具 |
| 发现标签 | `Product mockups`、`Product images` | 与当前设备样机和产出类型直接一致，不使用未经支持的标签 |
| 发布目标 | Figma Community | 不发布为组织内部资源 |
| 发布者 | Wang Zhentao | 当前产品决定人；最终在 Figma 发布界面确认账号身份 |
| 额外贡献者 | 首发不添加 | 当前没有已确认需要展示的额外贡献者 |
| Community 评论 | 开启 | 作为首发可观察的用户反馈入口；安全问题不得走公开评论 |
| Playground | 首发不添加 | 插件可在普通 Figma 文件中直接使用，不依赖专用样例文件才能完成首次任务 |

分类、评论和 Playground 是首发策略，不是永久产品约束；任何变更都应在提交前由决定人看到最终页面。

## 3. 支持与安全入口

公开仓库使用以下单一路线：

- 普通使用问题和缺陷：[GitHub Issues](https://github.com/Wjy555618-ai/little-bird-mockup/issues)，对应仓库根目录的 `SUPPORT.md`。
- 安全问题：[GitHub Private Vulnerability Reporting](https://github.com/Wjy555618-ai/little-bird-mockup/security/advisories/new)，对应 `SECURITY.md`；禁止要求用户在公开 Issue 中披露漏洞。
- Figma Community 的 support contact：填写 `https://github.com/Wjy555618-ai/little-bird-mockup/issues`，不填写占位地址。

2026-11-01 已在公开仓库页面确认 Issues 可访问，并在仓库安全设置中看到“禁用私有漏洞报告”控制与“存储库设置已保存”回执，证明私密漏洞报告已启用。该结论只证明支持/安全入口可用，不证明代码已经推送、CI 已通过或插件已经发布。

## 4. 网络访问审查

- Community 应显示：`Restricted network access`。
- 正式插件只允许访问 `https://unrivaled-cat-56bfe7.netlify.app`。
- 用途：读取公开、只读的样机目录 JSON、缩略图和样机底图。
- 正式制品不允许 localhost、通配域名、开发域名或远程 JavaScript。
- 用户的 Figma 选区、导入文件、导出结果、搜索词和文档信息不会发送到该目录服务。

最终生产 manifest 必须由发布脚本生成，并删除 `devAllowedDomains`。当前开发 manifest 出现 localhost 只属于开发态，不可作为 Community 上传制品。

## 5. Figma 数据安全问卷事实底稿

以下内容根据当前代码、`PRIVACY.md`、`SECURITY.md` 和生产合同整理。提交时必须以 Figma 当时实际表单问题为准，不得把措辞变化当作事实变化。

### 1. 是否托管插件后端服务

**是，但仅为项目控制的静态只读目录。** 目录部署在 Netlify，只提供固定 JSON 和媒体文件；没有账号、数据库、写入 API、远程脚本或处理用户内容的服务端逻辑。

### 1b. 是否有公开的漏洞管理流程

**是。** `SECURITY.md` 规定通过 GitHub Private Vulnerability Reporting 接收漏洞；公开入口为 `https://github.com/Wjy555618-ai/little-bird-mockup/security/advisories/new`，并已在 2026-11-01 验证仓库设置处于启用状态。

### 1c. 是否具有 SOC 2、ISO 27001 等安全认证

**否。** 不得把 Netlify 自身可能拥有的认证表述为本项目或插件获得的认证。

### 2. 是否请求并非自行托管的服务

**是。** 插件通过 HTTPS 从 Netlify 托管的固定域名读取公开目录。请求不包含从 Figma API 读取或派生的用户数据；基础设施可能按其政策记录 IP、时间、User-Agent 和错误日志。

### 3. 是否包含用户身份认证

**否。** 当前版本没有登录、注册、OAuth、密码、访问令牌或团队账号。

### 4. 是否保存从 Figma Plugin API 读取或派生的数据

**不保存用户设计数据。** 用户主动读取的选区只在插件运行期间转换和合成；不会上传或持久化到远程服务。Figma `clientStorage` 只保存最近使用的样机 ID 和公开目录缓存，浏览器可用时可能使用 `localStorage` 保存同类公开目录状态；离线目录最长使用 168 小时。这些缓存不包含用户画面、文档标题、图层名称或导出结果。

### 5. 如何管理插件更新

- 插件代码更新通过 Git 版本标签、只读最小权限 CI、固定依赖与不可覆盖的 REL 制品完成。
- Community 版本只允许从通过 `pnpm release:check` 的正式制品提交。
- 样机目录可以在不更新插件代码的情况下独立更新，但必须使用不可变资源、技术 QA、最终批次批准、manifest 最后激活和可验证回滚。
- 安全或隐私边界变化时，必须先更新 `PRIVACY.md`、`SECURITY.md` 和数据安全答案，再发布功能。

## 6. 外部与人工步骤状态

- 小鸟参考图及衍生标志的公开使用权已由决定人 Wang Zhentao 于 2026-11-01 确认。
- 图标、主缩略图、四张轮播图和推广文案已由决定人确认并冻结。
- 公开 GitHub 仓库、Issues 与 Private Vulnerability Reporting 已建立并验证；代码推送、线上 CI 与默认分支内容仍需单独验证。
- 在 Figma 账号启用双重验证，确认发布者身份与 Community 发布资格。
- 正式 Figma plugin ID `1698731404284779274` 已生成，并写入 `config/plugin.config.json` 与 `config/figma-community.json`。
- 发布前运行 `pnpm release:version <major.minor.patch>`，形成干净提交并推送 `origin`；只创建与该提交、`package.json` 和 `config/plugin.config.json` 完全一致的 `v<version>` 标签。
- 生成唯一 REL 制品并在 macOS、Windows、人工无障碍和真实 Figma 关键任务中完成发布级证据。
- 发布门禁全部通过后，产品层发布授权无需重做；实际平台提交仍遵守 Figma 与执行环境要求的临提交确认。遇到登录、验证码或双重验证时暂停，并用最短步骤引导决定人本人完成。

## 7. 官方来源

- Figma Community classic plugin 发布流程：<https://help.figma.com/hc/en-us/articles/360042293394-Publish-classic-plugins-to-the-Figma-Community>
- Figma 数据安全披露原则：<https://help.figma.com/hc/en-us/articles/16354660649495-Security-disclosure-principles>
- Figma plugin manifest：<https://developers.figma.com/docs/plugins/manifest/>

提交当天必须再次核对官方页面和真实发布界面；平台字段变化以当天界面为准。
