# 小鸟样机执行入口

任何新对话或新执行者在修改本项目之前，必须依次完成：

1. 阅读 `docs/ASSET_PIPELINE_AUTHORITY_2026-10-31.md`。
2. 阅读 `docs/ASSET_PIPELINE_DEVELOPMENT_CONTRACT.md`。
3. 运行 `pnpm asset:contract:check`，校验当前政策、人类可读合同和发布边界；`.spec-to-demo/` 仅是历史审计记录，不得阻断日常修复。
4. 运行 `pnpm asset:status`，以仓库状态而不是聊天记忆确定下一动作。
5. 涉及线上目录、生产 URL 或发布状态时，再运行 `pnpm remote:contract:check`；远程阶段以 `quality/remote-catalog-contract.json` 为唯一机器权威。
6. 修改既有文件前运行 `git status --short` 并保留全部无关修改。

## 不可跳过的规则

- 资产生产合同本身不自动授权外部发布。2026-11-01，决定人 Wang Zhentao 已明确授权创建公开 GitHub 仓库、配置公开 Issues 与私密漏洞报告、准备并提交 Figma Community 审核，以及在满足发布门禁后执行最终 Publish。任何新增第三方服务、付费升级或超出上述范围的外部发布仍需另行授权。
- 已发布站点固定为 `https://unrivaled-cat-56bfe7.netlify.app`，部署 ID 为 `6ae5de9c8a03867857235639`。任何第二次上传、重新部署或会额外消耗 Netlify 额度的动作，都必须先告知决定人并获得新的明确同意。
- 不得替人类声明参考图权利、发起候选创作委托、视觉批准或正式入库批准。
- 权利声明不等于创作委托。没有一份绑定当次参考图 SHA-256、assetId、分类和最多一个候选的未消耗人类委托时，禁止生成、导入或为测试自行新建候选。
- `WAITING_FOR_USER_INPUT` 是没有新委托时的正常终止点；不得为消除合同待办或验收缺口而创造用户没有要求的素材。
- 技术 QA 必须在人类最终决定之前完成；禁止以视觉批准、基线指纹或构建指纹作为技术 QA 的前置条件。
- 决定人只对已通过技术 QA 和真实 Figma 宿主回归的最终批次做一次“通过并入库”或“不通过”决定。
- 最终批次必须绑定当前插件构建，且逐项绑定准确 `assetId + revision + itemSha256 + qaReportSha256`；系统负责指纹，不得让决定人分项批准。
- 不得直接编辑正式 manifest 绕过提升脚本。
- 不得用旧聊天中的“同意”推断当前 revision 已获批准。
- 任何摘要、几何、分类、素材字节、QA 报告或插件构建变化后，最终批次决定立即失效。
- 失败或未知时进入 `BLOCKED`，报告原因和唯一下一动作，不静默继续。

详细流程见 `docs/ASSET_PIPELINE_RUNBOOK.md`。
