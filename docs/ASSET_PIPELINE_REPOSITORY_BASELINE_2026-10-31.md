# 样机流水线实施前仓库基线

捕获时间：2026-10-31（Asia/Shanghai）

用途：本文件固定实施前的可复现仓库事实。它避免把即将修改的实现文件本身继续当作不可变批准来源。

## 当前流程事实

1. `README.md` 的实施前 SHA-256 为 `65e60ef7e74db0e341501b92a31f2f82427d5d05a46922e9edd9ade17b3e6e87`。
   - 当前新增/更新流程从手工放置 revision 文件并手工更新 testing manifest 开始。
   - 当前四个资产明确标记为临时测试素材，不是最终内容库。
2. `scripts/serve-catalog.mjs` 的实施前 SHA-256 为 `502422160814889c46a37b078b0f77d37e39cea8f71933d58777e673ca6f17f2`。
   - 实施前 API 只有读取批准、保存几何、记录技术 QA。
   - 没有参考图导入、候选创建、视觉批准、正式入库批准或工作状态 API。
   - 技术 QA 报告绑定 `assetId`、`revision` 和 `itemSha256`。
3. `scripts/promote-mockup.mjs` 的实施前 SHA-256 为 `c987086d644224bafbd5fbc7ae8fbe5eaa2971645102d733f5121f5542e925da`。
   - 实施前提升只要求技术 QA 报告，没有独立人类 release approval。
   - 已具备正式库快照、不可变复制和原子 manifest 写入基础。
4. `shared/catalog-contract.js` 的实施前 SHA-256 为 `a64323ec926d5e84a9e0e52d52fe078fb3412b33fad4ab511e61a0441d6392ab`。
   - 当前目录合同强制分类、正整数 revision、环境状态、项目自制来源、基础图/缩略图摘要和正式 QA 元数据。
   - 实施前不验证流水线政策 ID 或独立人类 release approval。

## 实施前边界

- 正式目录仍为本地目录；没有 Netlify 或其他远程目录部署。
- GitHub、Netlify、Figma 社区发布均不在本实施授权范围。
- 当前工作区包含大量既有未提交修改，流水线实施必须保留并绕开无关改动。
- 本文件只证明上述实施前状态，不证明后续实现正确或验收完成。
