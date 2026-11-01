# 小鸟样机

一个中文优先、样机资产与插件版本解耦的 Figma 样机工具。当前本地正式库包含 **5 个已完成技术 QA、真实宿主回归和最终批次批准的完整无绿幕 r3 样机**。当前没有新素材创作委托，资产流水线应停在 `WAITING_FOR_USER_INPUT`。

代码、品牌和使用边界分别见 [架构](docs/ARCHITECTURE.md)、[品牌资产来源](docs/BRAND_ASSET_PROVENANCE.md)、[Figma Community 上架准备](docs/FIGMA_COMMUNITY_PUBLICATION_PREP.md)、[隐私说明](PRIVACY.md)、[安全政策](SECURITY.md)、[支持边界](SUPPORT.md)、[贡献说明](CONTRIBUTING.md) 与 [许可证](LICENSE)。公开可见不等于开放授权；当前仓库内容保留全部权利。

普通问题请提交到 [GitHub Issues](https://github.com/Wjy555618-ai/little-bird-mockup/issues)；安全漏洞请使用 [私密漏洞报告](https://github.com/Wjy555618-ai/little-bird-mockup/security/advisories/new)，不要公开披露。

## 当前交付由什么组成

- **Figma 插件**：把 Figma 选区或本地文件统一成一个静态画面对象，按样机推荐尺寸保持原比例，支持预览内拖动、等比缩放、色彩、透视、导出和写回画布。
- **样机质检台**：在素材进入正式库前，用与插件完全相同的渲染器检查坐标、边缘、透视、尺寸、来源和文件完整性。
- **测试库与正式库**：新素材先进入 `catalog/testing`；技术 QA 与决定人的准确版本批准是两道独立门禁，全部通过后才由脚本复制到 `catalog/production`。正式插件只应读取正式库。
- **共享渲染器**：插件与质检台都使用 `shared/mockup-renderer.js`，避免出现“质检台看起来正确、插件结果不同”的两套实现。

## 仓库导航

```text
plugin/             Figma 插件模板、生成制品与品牌运行资产
asset-lab/          样机质检台
shared/             插件与质检台共享的唯一渲染内核及安全边界
catalog/testing/    候选素材、技术 QA 与测试目录
catalog/production/ 已批准素材与正式目录
catalog/workflow/   参考图、委托、草稿、隔离区与流水线状态
catalog-history/    正式目录不可变快照与回滚依据
scripts/            构建、质检、提升、回滚、远程目录与发布脚本
quality/            机器可检查的合同、门禁与发布政策
tests/              行为、契约、性能、网络、安全与发布回归
docs/               架构、决策、运行手册和绑定准确构建的证据
```

新电脑或新执行者从 [`AGENTS.md`](AGENTS.md) 开始；它只负责路由到唯一权威合同和状态命令，不用聊天记忆代替仓库事实。历史证据的用途与失效规则见 [`docs/evidence/README.md`](docs/evidence/README.md)。

## 已验证的真实链路

旧 r1 素材曾完成以下回归流程，但已因零绿幕规则从活动目录撤下；这些记录只保留作历史证据：

1. 测试库载入成功，9 项自动检查通过，其中包含每个样机的推荐画面尺寸与比例。
2. 在质检台逐一查看网格、横屏、竖屏、明暗边界 4 种测试图，并完成人工确认。
3. 技术 QA 报告写入 `catalog/testing/v1/approvals`。
4. 这 4 个历史回归素材已在引入双重批准前进入正式库；它们仅用于兼容回归，不构成新素材可以绕过正式入库批准的先例。
5. 插件读取 4 个样机，完成搜索、分类、相似、最近使用、画面调整、透视、导出和粘贴流程。
6. 在 Figma 桌面端实际读取真实图片图层，切换样机后保留画面，并写回一个 `1200 × 900` 的样机图层。
7. 插件窗口在真实 Figma 中完成 `820 × 600` 展开态与 `320 × 64` 收起态切换。

素材服务不可用时，插件会从 Figma `clientStorage` 读取上次成功同步的目录，并明确显示“使用离线目录”。

## 当前 5 个本地正式库 r3 样机

- 工作室显示器 · 正面
- 岩石手机 · 正面
- 支架手机 · 倾斜
- 石墨笔记本 · 倾斜
- 极简工作站显示器 · 右后三分之二视角

它们的底图和缩略图本身均为完整样机，运行时只使用显式孔径几何，不包含绿幕或色键板。它们已进入本地 `catalog/production`；这不等于已上线、已发布 Figma 社区或已获得外部用户验证。

## 本地运行

安装依赖后，使用项目命令启动本地目录与预览服务：

```bash
pnpm install --frozen-lockfile
pnpm catalog
```

服务默认运行在 `http://127.0.0.1:4173`：

- `http://127.0.0.1:4173/lab`：样机质检台
- `http://127.0.0.1:4173/preview`：插件浏览器预览
- `http://127.0.0.1:4173/catalog/testing/v1/manifest.json`：测试库
- `http://127.0.0.1:4173/catalog/production/v1/manifest.json`：正式库

然后在 Figma 的“插件 → 开发”中导入 [`plugin/manifest.json`](plugin/manifest.json)。开发态插件目前读取本地测试库，便于制作和调试。

## 新增或更新样机的标准流程

完整命令、字段和恢复方法见 [`docs/ASSET_PIPELINE_RUNBOOK.md`](docs/ASSET_PIPELINE_RUNBOOK.md)。主路径是：

1. 决定人针对当次截图明确要求“制作一个候选”，并声明参考图是 `owned`、`authorized` 或 `reference-only`。权利声明本身不等于创作委托。
2. 运行 `pnpm asset:authorize-request -- ... --confirmed-by-human`，创建不可变、最多生成一个候选的单次委托。
3. 执行代理制作项目自制候选图，再运行 `pnpm asset:import -- --request-id <requestId> ...`。系统导入后立即消耗委托，自动生成或核验 revision、尺寸、缩略图、不可变文件名和 SHA-256。
4. 打开 `/lab`，完成 10 项自动检查、4 种测试图和 5 项人工检查；记录绑定当前 item 摘要的技术 QA 通过。
5. 完成当前插件构建和真实 Figma 宿主回归，再运行 `pnpm asset:prepare-final-review -- --all` 生成一个最终批次。
6. 决定人只对整个准确批次做一次“通过并进入本地正式库”或“不通过”决定；通过后运行 `pnpm asset:approve-final -- ... --confirmed-by-human`。
7. 运行 `pnpm catalog:promote -- --all`。脚本先验证全部摘要与最终批次决定、保存快照并复制不可变文件，最后原子更新正式 manifest。
8. 运行 `pnpm check` 和 `pnpm asset:status`。兼容的新增素材只需更新远程目录，不需要修改插件业务代码。

任何素材、坐标、分类或渲染元数据发生变化，旧技术 QA 与正式入库批准都会失效。新对话先运行 `pnpm asset:contract:check` 和 `pnpm asset:status`，不得从聊天记忆推断批准。

## 正式发布前仍需完成

- 阶段零正式目录已首次手动部署到 `https://unrivaled-cat-56bfe7.netlify.app`；该事实只证明白名单静态目录已发布，不证明真实 Figma 线上闭环、中国大陆长期稳定性或 Figma 社区上架。
- `config/plugin.config.json` 已绑定准确阶段零 manifest；正式插件 ID 仍为空，因此正式 REL 包和 Figma Community 提交仍应失败关闭。
- 任何第二次 Netlify 上传、重新部署或额外额度消耗必须先获得 Wang Zhentao 新的明确同意。
- 禁止直接修改 `plugin/ui.js` 或生成的 `plugin/manifest.json` 来“绑定生产”。`pnpm release:check` 会拒绝 `.example`、localhost、全零/空 ID、开发权限、脏工作区、无远端和无对应版本标签。
- 当前 5 个 r3 已进入本地正式库，但不能因此宣称插件已对外发布或已达到成熟成功产品的外部证据标准。
- 当前已完成本机Chrome 500项目录烟测和本地回滚机制验证，但正式REL候选的完整Figma任务、Windows、最低设备性能、人工无障碍、真实回滚演练和外部用户证据仍必须按 [`docs/PRODUCTION_DEVELOPMENT_CONTRACT.md`](docs/PRODUCTION_DEVELOPMENT_CONTRACT.md) 补齐；自动测试通过不等于可发布或成功产品。

## 质量与发布命令

- `pnpm check`：开发合同、静态无障碍、生成物、目录、语法和行为/像素回归。
- `pnpm build:pilot`：生成独立的 `dist/plugin-pilot` 真实线上试运行构建；使用不与日常开发或正式发布冲突的专用本地插件身份、精确 Netlify production manifest 和 `PILOT-*` 指纹，不伪造正式 Figma plugin ID。
- `pnpm asset:contract:check`：验证资产流水线的批准合同、十道失败关闭门禁、受控分类和冻结来源摘要。
- `pnpm asset:status`：报告每个流水线素材的准确状态、阻塞原因和唯一下一动作。
- `pnpm ci:check`：验证 CI 最小权限、第三方 Action 完整提交 SHA、每周门禁、Dependabot 和标签发布制品保留策略。
- `pnpm performance:smoke`：真实Chrome执行500项目录首屏和30次搜索开发烟测；不能替代正式Figma性能证据。
- `pnpm catalog:history:check`：验证当前正式目录快照与不可变素材可用于回滚。
- `pnpm catalog:rollback -- --to <旧版本> --version <新版本>`：只做回滚演练；显式追加 `--apply` 才会写入新的单调版本。
- `pnpm release:package`（同 `pnpm build:production`）：全部生产工程门禁通过后，原子生成不可覆盖的 `dist/plugin`，内含来源提交、合同 ID 与合同字节摘要、测量政策、目录版本/摘要和制品摘要绑定；远程目录必须与本地正式manifest逐字一致。
- `pnpm evidence:draft -- --gate <G-xxx> --artifact-dir <正式插件目录> --id <证据ID> [--scope <范围>] [--write]`：从真实REL包生成默认 `NOT_RUN` 的完整证据草稿；不会预填通过结果。
- `pnpm evidence:check -- --file <证据.json> --gate <G-xxx> --artifact-dir <正式插件目录>`：从版本标签解析发布源提交，校验REL指纹、确定性制品摘要、合同字节摘要、目录版本/摘要、合同路径、场景断言、测量算术及每个原始附件的字节数和SHA-256。
- `pnpm security:check`：当前锁文件的高危依赖审计。
- `pnpm release:check`：最终生产工程门禁。当前外部条件缺失时必须失败，不能绕过。
- `quality/acceptance-gates.json`：机器可检查的四级成熟度合同；不保存可手工改写的通过状态。

## Git 原则

工程按可验证里程碑提交。测试库、批准报告、正式库与插件代码可以追溯；不把未测试功能或未部署状态表述为已完成。

版本变化见 [`CHANGELOG.md`](CHANGELOG.md)。公开仓库只提交可复现源码、运行资产、合同和必要证据；`node_modules`、本地缓存、秘密、临时构建目录及已淘汰的品牌草稿不进入版本库。
