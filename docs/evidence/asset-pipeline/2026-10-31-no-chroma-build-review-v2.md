# Spec-to-Demo review packet

- Handoff: `S2D-836f9e36f083`
- Schema: `3.0.0`
- Contract version: `3`
- Implementation revision: `—`
- Stage: `awaiting_build_approval`
- Baseline fingerprint: `sha256:be3d740e9e77beb3de46abeb0b98afd7bdc638574fd88c468cada6f534e5d851`
- Build fingerprint: `sha256:56f62949f0208c17145bc397292a32e62254f652f686b5df002b1f4f725eee35`
- Acceptance fingerprint: `sha256:9066548b9bce80a537878744666bb469a2ce4183321a8a97501cf5bacdc44049`

> Fingerprints prove review binding only. They do not prove implementation quality, product value, or final acceptance.

## Demo contract

- Type: `mixed`
- Audience: Wang Zhentao（产品与视觉决定人）, 拥有项目文件访问权的 AI/工程执行代理
- Test method: 先用确定性本地 fixture 执行成功、失败、边界、迁移和恢复测试；对全部活动底图、缩略图、schema、源码与构建产物执行零色键检查；再让五个迁移 r2 和一个全新完整候选完成多场景人类视觉观察与真实端到端闭环；不使用公网服务。
- Fidelity focus: role, implementation, look_and_feel

### Hypotheses

- **HYP-001** `technical_feasibility` critical=`True` — 本地确定性工具能够从受控输入生成或更新完整测试样机包，并在无效输入时不留下半完成状态。
- **HYP-002** `integration_feasibility` critical=`True` — 现有质检台、独立人类 release approval 与正式库提升可以形成摘要绑定、过期即拒绝、失败可恢复的真实闭环。
- **HYP-003** `workflow` critical=`True` — 决定人可只做权利、视觉和正式入库决定，新的执行对话可依靠持久状态继续工作。
- **HYP-004** `technical_feasibility` critical=`True` — 显式孔径几何/遮罩可以在完全不使用色键的前提下，为全部现有样机和新候选稳定完成透视映射、遮挡恢复、接缝控制和最终导出。

### Success measures and decision rules

- **MET-001** — measure: 受控有效 fixture 的测试库资产包与 manifest 结果; criterion: 全部必需字段、尺寸、缩略图、分类、revision 和 SHA-256 与实际文件一致，目录检查通过。; decision: 全部一致才支持继续；任一不一致则修复并重跑。
- **MET-002** — measure: 缺失权利、未知分类、非法路径、重复不可变路径和损坏图片的失败行为; criterion: 每个失败均返回明确原因，测试 manifest、正式 manifest 和既有素材字节保持不变。; decision: 任何静默接受或部分写入都否定技术可行性。
- **MET-003** — measure: 技术 QA、人类 release approval 与提升目标的摘要一致性; criterion: 只有三个记录绑定同一 assetId、revision、itemSha256 和当前 QA 摘要时提升成功。; decision: 任一缺失、错配或过期必须拒绝且不改变正式 manifest。
- **MET-004** — measure: 提升失败与恢复结果; criterion: 注入复制冲突或摘要漂移后，旧正式库仍通过检查；修复后可重试成功并保留快照。; decision: 旧正式库不可用或无法安全重试则否定集成可行性。
- **MET-005** — measure: 真实样机闭环中的人类操作; criterion: 决定人只提供参考与权利模式、视觉决定、正式入库决定，不手工编辑清单、路径、分类、摘要或发布脚本。; decision: 出现额外不可避免的人工工程操作则记录为流程缺口并修订。
- **MET-006** — measure: 无旧聊天上下文的恢复观察; criterion: 新的执行者读取仓库后准确报告当前状态、阻塞原因和唯一下一动作，且不复用聊天中的未记录批准。; decision: 需要旧聊天补全关键状态则不支持工作流假设。
- **MET-007** — measure: 活动目录、运行时和构建产物的零色键完整性; criterion: testing/production 当前项、共享渲染器、插件构建、质检服务和发布脚本中不存在色键 schema、色键代码或色键兼容分支；所有当前底图和缩略图均通过完整样机自动检查与人类检查。; decision: 任一活动项仍是绿幕、任一执行路径仍依赖颜色键控或任一完整性检查未通过，迁移即不成立。
- **MET-008** — measure: 五个迁移样机和一个全新候选的真实合成质量; criterion: 每个准确 revision 在网格、横屏、竖屏、边界、裁切、自由透视、300% 接缝和导出检查中均无绿幕、露底、越界和可见接缝，并取得人类对完整样机的明确结论。; decision: 任何单个样机或场景失败都阻止正式库提升和合同验收，必须生成新 revision 或修正机制后重测。

### Build-only sources

- **SRC-003** `repository_evidence` — 零绿幕迁移前机器政策的冻结基线，证明旧 schema v4、renderer 2.3.0 与接缝门禁依赖色键机制。; locator `docs/ASSET_PIPELINE_POLICY_PRE_V5_BASELINE_2026-10-31.md`; digest `sha256:489389081e9be96fa789129860efa46e7ed9872a9c7c11f6c0d6ab0dabe250b1`

### Capability truth

- **CAP-001 参考与候选安全导入** — 记录参考权利并把代理生成的候选变成完整、可校验的测试素材包。; truth `constrained_real`; priority `core`; hypothesis-valid `True`; integration: 真实本地文件、真实测试目录和原子文件写入; limitation: 只验证本地静态栅格样机，不内置或验证图片生成模型本身。; disclosure: 通过只证明候选导入机制，不证明任意截图都能生成合格视觉素材。
- **CAP-002 确定性身份、版本与受控分类** — 自动产生或核验稳定 ID、revision、尺寸、缩略图、摘要、分类和标签。; truth `constrained_real`; priority `core`; hypothesis-valid `True`; integration: 受控 taxonomy 与当前 catalog schema 的真实校验; limitation: 首版 taxonomy 仅包含当前已批准的显示器、手机和笔记本分类。; disclosure: 未知分类会阻塞，不代表系统能自动理解所有设备类别。
- **CAP-003 技术 QA 与双重人类批准绑定** — 区分技术 QA、视觉批准和正式入库批准，并使三者绑定准确字节版本。; truth `constrained_real`; priority `core`; hypothesis-valid `True`; integration: 真实质检台、真实摘要和本地人类声明记录; limitation: 本地人类声明可追溯但不提供密码学身份认证。; disclosure: 未来云端化需要认证审批，但不得降低当前版本绑定强度。
- **CAP-004 失败关闭的正式库提升与恢复** — 只有当前批准有效时才复制不可变文件并最后原子更新正式清单。; truth `constrained_real`; priority `core`; hypothesis-valid `True`; integration: 真实本地 testing/production 目录、快照和提升脚本; limitation: 本阶段不验证远程 CDN 上传或跨服务原子性。; disclosure: 本地提升通过不等于线上目录已经部署。
- **CAP-005 持久状态与新对话恢复** — 让执行者从仓库确定当前状态、阻塞和下一动作并遵守发布边界。; truth `constrained_real`; priority `core`; hypothesis-valid `True`; integration: 仓库内 AGENTS、运行手册、政策、状态文件和确定性状态命令; limitation: 只对能够访问同一项目目录和本地运行时的执行者有效。; disclosure: 它不保证任意无文件访问权的聊天自动获得项目知识。
- **CAP-006 零绿幕完整样机合成** — 以完整样机底图和显式孔径数据替代所有色键板，并让 testing、production、质检台、插件与导出共享一条无色键渲染路径。; truth `constrained_real`; priority `core`; hypothesis-valid `True`; integration: 真实 catalog 图像、显式屏幕孔径/遮罩、共享 Canvas 渲染器和真实 Figma 插件构建; limitation: 本阶段验证当前目录中的显示器、手机和笔记本静态栅格样机，不宣称覆盖任意复杂透明材质或动态三维场景。; disclosure: 自动像素检查不能单独证明审美完整，必须与准确 revision 的人类视觉检查共同通过。

### Explicitly out of scope

- 内置图片生成供应商 API
- GitHub 或公网部署
- Figma 社区发布
- 多人云权限系统
- 宣称生产规模可靠性或商业成功

### Build approval

- Status: `pending`
- Human: —
- Approved at: `—`
- Recorded fingerprint: `—`

## Delivery trace

### Vertical slice

- Capabilities: `CAP-001, CAP-002, CAP-003, CAP-004, CAP-005, CAP-006`
- Requirements: `REQ-001, REQ-002, REQ-003, REQ-004, REQ-005, REQ-006, REQ-007, REQ-008, REQ-009, REQ-010`
- Touchpoints: `TP-001, TP-002, TP-003, TP-004, TP-005, TP-006, TP-007`
- Completion rule: 旧色键架构与活动绿幕 revision 全部撤出；五个现有样机完成 r2 零绿幕迁移和准确版本复审；一个全新完整样机从参考记录完成到 PROMOTED 的真实闭环；全部 fixture 与渲染场景产生当前 L1/L2/L3/L4 证据；新执行对话完成恢复观察；无开放高/严重发现；PASS_CANDIDATE 后由决定人批准准确验收指纹。

### Requirements and scenarios

#### REQ-001 — 流水线 SHALL 在候选导入前记录参考摘要和人类声明的权利模式，并对 reference-only 禁止复用参考图字节。

- Priority: `must`; method: `test`
- Rationale: 来源和权利未知不能被自动化推定为可发布。
- Capability: `CAP-001`
- Tasks: `TASK-002, TASK-006`
- Implementation: `scripts/asset-pipeline.mjs, scripts/lib/asset-pipeline.mjs, quality/asset-pipeline-policy.json, package.json, pnpm-lock.yaml`
- Scenario **SCN-001** — Given 有效参考文件; 有效人类权利声明; When 执行候选导入; Then 状态记录参考摘要和权利模式; 候选进入 CANDIDATE_READY; evidence `EVD-AP-001, EVD-AP-002`
- Scenario **SCN-002** — Given 权利模式缺失或 reference-only 复用参考图字节; When 执行候选导入; Then 操作失败并给出明确原因; 测试 manifest 和既有文件不变; evidence `EVD-AP-001, EVD-AP-002`

#### REQ-002 — 流水线 SHALL 确定性生成或核验 assetId、revision、尺寸、缩略图、摘要、分类和标签，并在写入前完成冲突检查。

- Priority: `must`; method: `test`
- Rationale: 插件识别、缓存、批准和不可变文件依赖稳定身份与真实元数据。
- Capability: `CAP-002`
- Tasks: `TASK-002, TASK-006`
- Implementation: `scripts/asset-pipeline.mjs, scripts/lib/asset-pipeline.mjs, quality/asset-pipeline-policy.json, package.json, pnpm-lock.yaml`
- Scenario **SCN-003** — Given 有效基础图; 受控分类; 合法屏幕几何; When 创建新样机; Then 自动生成完整素材包和清单项; 所有摘要与真实文件一致; evidence `EVD-AP-001, EVD-AP-002`
- Scenario **SCN-004** — Given 未知分类、非法 ID 或相同不可变路径不同字节; When 创建或更新样机; Then 操作失败关闭; 不会创建新分类或覆盖既有文件; evidence `EVD-AP-001, EVD-AP-002`

#### REQ-003 — 视觉批准 SHALL 由确定的人类绑定 assetId、revision 和 candidateSha256；候选字节变化后旧批准失效。

- Priority: `must`; method: `test`
- Rationale: 视觉认可必须对应实际进入质检的候选。
- Capability: `CAP-003`
- Tasks: `TASK-003, TASK-006`
- Implementation: `scripts/authorize-mockup.mjs, scripts/lib/asset-pipeline.mjs, asset-lab/index.html, asset-lab/styles.css, asset-lab/app.js, scripts/serve-catalog.mjs`
- Scenario **SCN-005** — Given 候选已生成; 决定人明确视觉通过; When 记录视觉批准; Then 批准绑定准确候选摘要; 状态进入 VISUAL_APPROVED; evidence `EVD-AP-001, EVD-AP-002`
- Scenario **SCN-006** — Given 批准摘要与当前候选不一致; When 尝试进入 TESTING; Then 操作被拒绝; 旧批准保留为历史但不再 current; evidence `EVD-AP-001, EVD-AP-002`

#### REQ-004 — 正式入库批准 SHALL 只在技术 QA 通过后由确定的人类记录，并绑定当前 itemSha256 与 qaReportSha256。

- Priority: `must`; method: `test`
- Rationale: 机器检查与人类产品决定必须同时存在且不能指向不同版本。
- Capability: `CAP-003`
- Tasks: `TASK-003, TASK-004, TASK-006`
- Implementation: `scripts/authorize-mockup.mjs, scripts/serve-catalog.mjs, scripts/promote-mockup.mjs, scripts/catalog-release.mjs, shared/catalog-contract.js, scripts/lib/asset-pipeline.mjs`
- Scenario **SCN-007** — Given 当前技术 QA 有效; 决定人明确批准正式入库; When 记录 release approval; Then 记录包含人类、时间、item 和 QA 摘要; 状态进入 RELEASE_APPROVED; evidence `EVD-AP-001, EVD-AP-002, EVD-AP-003`
- Scenario **SCN-008** — Given QA 缺失、失败、过期或人类决定缺失; When 记录批准或执行提升; Then 操作被拒绝; 正式 manifest 不变; evidence `EVD-AP-001, EVD-AP-002, EVD-AP-003`

#### REQ-005 — 提升 SHALL 先验证双重批准并完成快照、不可变文件复制和摘要核验，最后原子更新正式 manifest；失败时旧正式库保持可用。

- Priority: `must`; method: `test`
- Rationale: 避免清单先更新、文件缺失或半次提升污染插件读取。
- Capability: `CAP-004`
- Tasks: `TASK-004, TASK-006`
- Implementation: `scripts/promote-mockup.mjs, scripts/catalog-release.mjs, shared/catalog-contract.js, scripts/lib/asset-pipeline.mjs, scripts/lib/catalog-history.mjs`
- Scenario **SCN-009** — Given 双重批准均为当前版本; 目标不可变路径无冲突; When 提升单个样机; Then 素材和批准记录进入正式库; catalogVersion 递增且正式检查通过; evidence `EVD-AP-001, EVD-AP-002`
- Scenario **SCN-010** — Given 复制冲突、摘要漂移或中途失败; When 提升失败后修复并重试; Then 失败期间旧正式 manifest 可用; 修复后可从明确状态安全重试; evidence `EVD-AP-001, EVD-AP-002`

#### REQ-006 — 仓库 SHALL 持久记录每个资产的当前状态、摘要、阻塞原因、历史决定和唯一下一动作，并提供新对话可执行的状态命令与运行手册。

- Priority: `must`; method: `user_research`
- Rationale: 执行连续性必须来自可检查状态而非聊天记忆。
- Capability: `CAP-005`
- Tasks: `TASK-005, TASK-006`
- Implementation: `AGENTS.md, docs/ASSET_PIPELINE_RUNBOOK.md, README.md, scripts/asset-pipeline.mjs, package.json`
- Scenario **SCN-011** — Given 新执行对话没有旧聊天上下文; 仓库包含中途停止的资产; When 执行合同和状态检查; Then 准确报告当前状态和阻塞; 只执行政策允许的下一动作; evidence `—`
- Scenario **SCN-012** — Given 状态摘要与实际文件不一致; When 执行恢复检查; Then 状态标记 BLOCKED 或失效; 不会依据旧聊天或旧批准继续; evidence `EVD-AP-001, EVD-AP-002`

#### REQ-007 — 本阶段工具和文档 SHALL 保持 GitHub、Netlify、Figma 社区与其他外部部署为禁止状态，除非未来合同变更并重新批准。

- Priority: `must`; method: `inspection`
- Rationale: 当前授权只覆盖本地实现和验证。
- Capability: `CAP-005`
- Tasks: `TASK-001, TASK-005, TASK-006`
- Implementation: `quality/asset-pipeline-policy.json, scripts/verify-asset-pipeline-contract.mjs, AGENTS.md, docs/ASSET_PIPELINE_RUNBOOK.md, package.json`
- Scenario **SCN-013** — Given 本阶段调用部署或发布动作; When 政策校验运行; Then 校验失败并指出未授权边界; 不执行外部操作; evidence `EVD-AP-001, EVD-AP-002, EVD-AP-004`

#### REQ-008 — 流水线 SHALL 只接收自身已是完整样机的候选底图和缩略图，并 SHALL 拒绝色键字段、色键模式、典型绿幕占位屏或依赖运行时隐藏占位板才完整的素材。

- Priority: `must`; method: `test`
- Rationale: 完整性必须从候选进入系统时成立，不能靠插件缩略图或最终合成掩盖不合格底图。
- Capability: `CAP-006`
- Tasks: `TASK-007, TASK-008, TASK-009, TASK-010`
- Implementation: `quality/asset-pipeline-policy.json, scripts/lib/asset-pipeline.mjs, shared/catalog-contract.js, scripts/serve-catalog.mjs, scripts/catalog-release.mjs, scripts/verify-asset-pipeline-contract.mjs`
- Scenario **SCN-014** — Given 完整非色键候选底图; 显式屏幕孔径几何; 完整缩略图; When 候选导入并进入视觉审核; Then 底图和缩略图在不运行替换算法时均可直接展示; 自动完整性检查和人类完整样机检查均可独立执行; evidence `—`
- Scenario **SCN-015** — Given manifest 含色键字段或模式; 屏幕区域呈典型高占比绿幕占位; 缩略图与底图完整性不一致; When 导入、目录检查、技术 QA 或提升任一门禁运行; Then 操作失败关闭并指出具体不合格项; 不生成视觉批准、技术 QA 或正式入库资格; evidence `EVD-AP-005`

#### REQ-009 — 共享渲染器 SHALL 仅依据显式屏幕孔径几何/遮罩投影用户画面，并 SHALL 删除按底图颜色推断孔径、清除色溢或扩张色键边缘的全部代码和兼容分支。

- Priority: `must`; method: `test`
- Rationale: 单一数据驱动合成路径能让编辑坐标、可见边界、裁切、命中测试和导出保持一致，并从根上消除绿幕与色溢。
- Capability: `CAP-006`
- Tasks: `TASK-007, TASK-009`
- Implementation: `shared/mockup-renderer.js, plugin/code.js, plugin/ui.js, asset-lab/app.js, scripts/build-plugin.mjs, scripts/generate-catalog-thumbnails.mjs`
- Scenario **SCN-016** — Given 完整样机底图; 显式孔径几何或遮罩; 任意批准测试画面; When 质检台、插件或导出调用共享渲染器; Then 用户画面只出现在显式孔径内; 遮挡与反射按声明图层恢复; 所有入口产生同一合成结果; evidence `—`
- Scenario **SCN-017** — Given 300% 缩放、裁切边界、自由透视和高对比测试画面; When 执行最终合成和逐像素边界检查; Then 孔径外用户像素为零; 孔径边缘没有绿幕、露底、可见缝或锯齿扩张; 选择框、命中区域和最终像素边界一致; evidence `—`

#### REQ-010 — 四个现有正式样机和 workstation-display-three-quarter SHALL 以新 revision 迁移为完整非色键样机；旧绿幕 revision SHALL 从所有活动清单和服务路径撤下，且其旧批准 SHALL 仅保留为不可复用的历史。

- Priority: `must`; method: `demonstration`
- Rationale: 只修改新候选会让正式库继续违反硬规则；覆盖旧字节又会破坏版本与批准追踪。
- Capability: `CAP-006`
- Tasks: `TASK-008, TASK-009, TASK-010`
- Implementation: `scripts/promote-mockup.mjs, scripts/catalog-release.mjs, docs/ARCHITECTURE.md, docs/ASSET_PIPELINE_RUNBOOK.md`
- Scenario **SCN-018** — Given 活动目录含五个不合格绿幕 r1; 旧批准绑定 r1 摘要; When 执行零绿幕迁移; Then 每个样机产生独立 r2 并重新完成视觉、技术和正式批准; 活动清单不再引用 r1; r1 历史记录不能通过当前门禁; evidence `—`
- Scenario **SCN-019** — Given 任一旧绿幕文件仍被活动 manifest、插件、质检台或提升脚本引用; When 目录检查或发布检查运行; Then 检查失败并列出残留引用; 不得声称迁移完成或继续正式提升; evidence `EVD-AP-005`

### Touchpoints

- **TP-001 样机流水线命令** `automation` — requirements: `REQ-001, REQ-002, REQ-003, REQ-006, REQ-008, REQ-010`; states: ready, running, complete, failed, blocked; refs: `scripts/asset-pipeline.mjs, scripts/lib/asset-pipeline.mjs, package.json, pnpm-lock.yaml`
- **TP-002 样机质检台** `screen` — requirements: `REQ-003, REQ-004, REQ-008, REQ-009, REQ-010`; states: loading, testing, qa_failed, qa_passed, awaiting_release_approval, release_approved, error; refs: `asset-lab/index.html, asset-lab/styles.css, asset-lab/app.js, scripts/serve-catalog.mjs`
- **TP-003 流水线政策与持久状态** `data` — requirements: `REQ-001, REQ-002, REQ-003, REQ-004, REQ-006, REQ-007, REQ-008, REQ-010`; states: valid, invalid, current, stale, blocked; refs: `quality/asset-pipeline-policy.json, scripts/lib/asset-pipeline.mjs`
- **TP-004 批准与正式库提升** `integration` — requirements: `REQ-004, REQ-005, REQ-010`; states: not_authorized, authorized, promoting, promoted, failed, recoverable; refs: `scripts/authorize-mockup.mjs, scripts/promote-mockup.mjs, scripts/catalog-release.mjs, shared/catalog-contract.js, scripts/lib/asset-pipeline.mjs`
- **TP-005 机器门禁与回归测试** `test` — requirements: `REQ-001, REQ-002, REQ-003, REQ-004, REQ-005, REQ-006, REQ-007, REQ-008, REQ-009, REQ-010`; states: not_run, pass, fail, inconclusive; refs: `scripts/verify-asset-pipeline-contract.mjs, tests/asset-pipeline-contract.test.mjs, tests/asset-pipeline.test.mjs, tests/catalog.test.mjs`
- **TP-006 新对话入口与运行手册** `content` — requirements: `REQ-006, REQ-007`; states: current, stale, blocked; refs: `AGENTS.md, docs/ASSET_PIPELINE_RUNBOOK.md, README.md`
- **TP-007 显式孔径共享渲染器与活动样机目录** `integration` — requirements: `REQ-009, REQ-010`; states: legacy_chroma_blocked, migration_pending, aperture_renderer_ready, assets_migrated, verified, failed; refs: `shared/mockup-renderer.js, plugin/code.js, plugin/ui.js`

### Tasks

- **TASK-001** `done` — 实现机器政策校验器并把未授权外部发布设为失败关闭。; files: `scripts/verify-asset-pipeline-contract.mjs, quality/asset-pipeline-policy.json, package.json`; tests: `tests/asset-pipeline-contract.test.mjs`
- **TASK-002** `done` — 实现参考记录、原子素材导入、缩略图、自动身份/revision/尺寸/摘要和受控分类。; files: `scripts/asset-pipeline.mjs, scripts/lib/asset-pipeline.mjs, package.json, pnpm-lock.yaml`; tests: `tests/asset-pipeline.test.mjs`
- **TASK-003** `done` — 实现视觉批准、技术 QA 和正式入库批准的分离记录与过期检测。; files: `scripts/authorize-mockup.mjs, scripts/serve-catalog.mjs, asset-lab/index.html, asset-lab/styles.css, asset-lab/app.js, scripts/lib/asset-pipeline.mjs`; tests: `tests/asset-pipeline.test.mjs`
- **TASK-004** `done` — 强化正式库提升，强制 release approval、原子顺序、摘要复核与恢复语义。; files: `scripts/promote-mockup.mjs, scripts/catalog-release.mjs, shared/catalog-contract.js, scripts/lib/asset-pipeline.mjs`; tests: `tests/asset-pipeline.test.mjs, tests/catalog.test.mjs`
- **TASK-005** `done` — 创建根级执行入口、运行手册和可验证的状态/下一动作输出。; files: `AGENTS.md, docs/ASSET_PIPELINE_RUNBOOK.md, README.md, scripts/asset-pipeline.mjs, package.json`; tests: `tests/asset-pipeline.test.mjs, tests/asset-pipeline-contract.test.mjs`
- **TASK-006** `done` — 执行成功、失败、边界、恢复和现有目录回归测试，保存可摘要绑定的证据。; files: `tests/asset-pipeline.test.mjs, tests/asset-pipeline-contract.test.mjs, tests/catalog.test.mjs`; tests: `tests/asset-pipeline.test.mjs, tests/asset-pipeline-contract.test.mjs, tests/catalog.test.mjs`
- **TASK-007** `pending` — 建立 catalog schema v5 与 aperture-mask 共享渲染器，删除色键检测、色溢清理、色键接缝测量和 v4 兼容分支，并同步质检、插件、缩略图和发布校验。; files: `shared/mockup-renderer.js, shared/catalog-contract.js, quality/asset-pipeline-policy.json, scripts/lib/asset-pipeline.mjs, scripts/serve-catalog.mjs, scripts/catalog-release.mjs, scripts/generate-catalog-thumbnails.mjs, scripts/build-plugin.mjs, asset-lab/app.js, plugin/code.js, plugin/ui.js, docs/ARCHITECTURE.md, docs/ASSET_PIPELINE_RUNBOOK.md`; tests: `tests/catalog.test.mjs, tests/plugin.test.mjs, tests/asset-pipeline.test.mjs, tests/asset-pipeline-contract.test.mjs`
- **TASK-008** `pending` — 用确定性迁移工具为四个现有正式样机和 workstation-display-three-quarter 生成完整非色键 r2，撤下活动 r1 引用并使所有旧批准不可复用。; files: `scripts/migrate-chroma-catalog-v5.mjs, scripts/lib/asset-pipeline.mjs, scripts/promote-mockup.mjs, scripts/catalog-release.mjs`; tests: `tests/catalog-migration.test.mjs, tests/asset-pipeline.test.mjs`
- **TASK-009** `pending` — 增加零色键静态扫描、典型绿幕占位拒绝、显式孔径逐像素边界测试、五个 r2 多场景回归和活动目录残留引用检查。; files: `scripts/verify-no-chroma.mjs, scripts/verify-asset-pipeline-contract.mjs, tests/no-chroma.test.mjs, tests/catalog-migration.test.mjs, tests/catalog.test.mjs, tests/plugin.test.mjs, tests/asset-pipeline.test.mjs`; tests: `tests/no-chroma.test.mjs, tests/catalog-migration.test.mjs, tests/catalog.test.mjs, tests/plugin.test.mjs, tests/asset-pipeline.test.mjs`
- **TASK-010** `pending` — 在五个迁移 r2 分别取得准确视觉结论后，用一个全新完整非绿幕候选执行导入、视觉批准、技术 QA、正式入库批准和原子提升的真实闭环。; files: `scripts/asset-pipeline.mjs, scripts/authorize-mockup.mjs, scripts/serve-catalog.mjs, scripts/promote-mockup.mjs`; tests: `tests/asset-pipeline.test.mjs, tests/no-chroma.test.mjs`


<details>
<summary>Exact build fingerprint payload</summary>

The concise review exposes every decision-bearing field. This is the exact hashed manifest for auditing identifiers, traces, and digests.

    {
      "schema_version": "3.0.0",
      "handoff_id": "S2D-836f9e36f083",
      "profile": "standard",
      "contract_version": 3,
      "baseline_fingerprint": "sha256:be3d740e9e77beb3de46abeb0b98afd7bdc638574fd88c468cada6f534e5d851",
      "source_material": [
        {
          "id": "SRC-003",
          "kind": "repository_evidence",
          "summary": "零绿幕迁移前机器政策的冻结基线，证明旧 schema v4、renderer 2.3.0 与接缝门禁依赖色键机制。",
          "locator": "docs/ASSET_PIPELINE_POLICY_PRE_V5_BASELINE_2026-10-31.md",
          "content_digest": "sha256:489389081e9be96fa789129860efa46e7ed9872a9c7c11f6c0d6ab0dabe250b1",
          "verified": true
        }
      ],
      "demo_contract": {
        "demo_type": "mixed",
        "hypotheses": [
          {
            "id": "HYP-001",
            "type": "technical_feasibility",
            "statement": "本地确定性工具能够从受控输入生成或更新完整测试样机包，并在无效输入时不留下半完成状态。",
            "critical": true,
            "source_ids": [
              "SRC-001",
              "SRC-002",
              "SRC-003"
            ],
            "measure_ids": [
              "MET-001",
              "MET-002"
            ]
          },
          {
            "id": "HYP-002",
            "type": "integration_feasibility",
            "statement": "现有质检台、独立人类 release approval 与正式库提升可以形成摘要绑定、过期即拒绝、失败可恢复的真实闭环。",
            "critical": true,
            "source_ids": [
              "SRC-001",
              "SRC-002",
              "SRC-005",
              "SRC-006"
            ],
            "measure_ids": [
              "MET-003",
              "MET-004"
            ]
          },
          {
            "id": "HYP-003",
            "type": "workflow",
            "statement": "决定人可只做权利、视觉和正式入库决定，新的执行对话可依靠持久状态继续工作。",
            "critical": true,
            "source_ids": [
              "SRC-001",
              "SRC-002"
            ],
            "measure_ids": [
              "MET-005",
              "MET-006"
            ]
          },
          {
            "id": "HYP-004",
            "type": "technical_feasibility",
            "statement": "显式孔径几何/遮罩可以在完全不使用色键的前提下，为全部现有样机和新候选稳定完成透视映射、遮挡恢复、接缝控制和最终导出。",
            "critical": true,
            "source_ids": [
              "SRC-008",
              "SRC-009"
            ],
            "measure_ids": [
              "MET-007",
              "MET-008"
            ]
          }
        ],
        "audience": [
          "Wang Zhentao（产品与视觉决定人）",
          "拥有项目文件访问权的 AI/工程执行代理"
        ],
        "test_method": "先用确定性本地 fixture 执行成功、失败、边界、迁移和恢复测试；对全部活动底图、缩略图、schema、源码与构建产物执行零色键检查；再让五个迁移 r2 和一个全新完整候选完成多场景人类视觉观察与真实端到端闭环；不使用公网服务。",
        "success_measures": [
          {
            "id": "MET-001",
            "hypothesis_ids": [
              "HYP-001"
            ],
            "measure": "受控有效 fixture 的测试库资产包与 manifest 结果",
            "criterion": "全部必需字段、尺寸、缩略图、分类、revision 和 SHA-256 与实际文件一致，目录检查通过。",
            "decision_rule": "全部一致才支持继续；任一不一致则修复并重跑。",
            "source_ids": [
              "SRC-002",
              "SRC-003",
              "SRC-007"
            ]
          },
          {
            "id": "MET-002",
            "hypothesis_ids": [
              "HYP-001"
            ],
            "measure": "缺失权利、未知分类、非法路径、重复不可变路径和损坏图片的失败行为",
            "criterion": "每个失败均返回明确原因，测试 manifest、正式 manifest 和既有素材字节保持不变。",
            "decision_rule": "任何静默接受或部分写入都否定技术可行性。",
            "source_ids": [
              "SRC-002",
              "SRC-003"
            ]
          },
          {
            "id": "MET-003",
            "hypothesis_ids": [
              "HYP-002"
            ],
            "measure": "技术 QA、人类 release approval 与提升目标的摘要一致性",
            "criterion": "只有三个记录绑定同一 assetId、revision、itemSha256 和当前 QA 摘要时提升成功。",
            "decision_rule": "任一缺失、错配或过期必须拒绝且不改变正式 manifest。",
            "source_ids": [
              "SRC-002",
              "SRC-003",
              "SRC-006"
            ]
          },
          {
            "id": "MET-004",
            "hypothesis_ids": [
              "HYP-002"
            ],
            "measure": "提升失败与恢复结果",
            "criterion": "注入复制冲突或摘要漂移后，旧正式库仍通过检查；修复后可重试成功并保留快照。",
            "decision_rule": "旧正式库不可用或无法安全重试则否定集成可行性。",
            "source_ids": [
              "SRC-002",
              "SRC-003",
              "SRC-006"
            ]
          },
          {
            "id": "MET-005",
            "hypothesis_ids": [
              "HYP-003"
            ],
            "measure": "真实样机闭环中的人类操作",
            "criterion": "决定人只提供参考与权利模式、视觉决定、正式入库决定，不手工编辑清单、路径、分类、摘要或发布脚本。",
            "decision_rule": "出现额外不可避免的人工工程操作则记录为流程缺口并修订。",
            "source_ids": [
              "SRC-001",
              "SRC-002"
            ]
          },
          {
            "id": "MET-006",
            "hypothesis_ids": [
              "HYP-003"
            ],
            "measure": "无旧聊天上下文的恢复观察",
            "criterion": "新的执行者读取仓库后准确报告当前状态、阻塞原因和唯一下一动作，且不复用聊天中的未记录批准。",
            "decision_rule": "需要旧聊天补全关键状态则不支持工作流假设。",
            "source_ids": [
              "SRC-001",
              "SRC-002"
            ]
          },
          {
            "id": "MET-007",
            "hypothesis_ids": [
              "HYP-004"
            ],
            "measure": "活动目录、运行时和构建产物的零色键完整性",
            "criterion": "testing/production 当前项、共享渲染器、插件构建、质检服务和发布脚本中不存在色键 schema、色键代码或色键兼容分支；所有当前底图和缩略图均通过完整样机自动检查与人类检查。",
            "decision_rule": "任一活动项仍是绿幕、任一执行路径仍依赖颜色键控或任一完整性检查未通过，迁移即不成立。",
            "source_ids": [
              "SRC-008",
              "SRC-009"
            ]
          },
          {
            "id": "MET-008",
            "hypothesis_ids": [
              "HYP-004"
            ],
            "measure": "五个迁移样机和一个全新候选的真实合成质量",
            "criterion": "每个准确 revision 在网格、横屏、竖屏、边界、裁切、自由透视、300% 接缝和导出检查中均无绿幕、露底、越界和可见接缝，并取得人类对完整样机的明确结论。",
            "decision_rule": "任何单个样机或场景失败都阻止正式库提升和合同验收，必须生成新 revision 或修正机制后重测。",
            "source_ids": [
              "SRC-008",
              "SRC-009"
            ]
          }
        ],
        "in_scope_capability_ids": [
          "CAP-001",
          "CAP-002",
          "CAP-003",
          "CAP-004",
          "CAP-005",
          "CAP-006"
        ],
        "out_of_scope": [
          "内置图片生成供应商 API",
          "GitHub 或公网部署",
          "Figma 社区发布",
          "多人云权限系统",
          "宣称生产规模可靠性或商业成功"
        ],
        "fidelity_focus": [
          "role",
          "implementation",
          "look_and_feel"
        ]
      },
      "capabilities": [
        {
          "id": "CAP-001",
          "name": "参考与候选安全导入",
          "purpose": "记录参考权利并把代理生成的候选变成完整、可校验的测试素材包。",
          "source_decision_ids": [
            "PD-001",
            "PD-003"
          ],
          "hypothesis_ids": [
            "HYP-001"
          ],
          "priority": "core",
          "truth_level": "constrained_real",
          "valid_for_hypothesis": true,
          "integration_mode": "真实本地文件、真实测试目录和原子文件写入",
          "limitation": "只验证本地静态栅格样机，不内置或验证图片生成模型本身。",
          "disclosure": "通过只证明候选导入机制，不证明任意截图都能生成合格视觉素材。"
        },
        {
          "id": "CAP-002",
          "name": "确定性身份、版本与受控分类",
          "purpose": "自动产生或核验稳定 ID、revision、尺寸、缩略图、摘要、分类和标签。",
          "source_decision_ids": [
            "PD-004",
            "PD-005"
          ],
          "hypothesis_ids": [
            "HYP-001"
          ],
          "priority": "core",
          "truth_level": "constrained_real",
          "valid_for_hypothesis": true,
          "integration_mode": "受控 taxonomy 与当前 catalog schema 的真实校验",
          "limitation": "首版 taxonomy 仅包含当前已批准的显示器、手机和笔记本分类。",
          "disclosure": "未知分类会阻塞，不代表系统能自动理解所有设备类别。"
        },
        {
          "id": "CAP-003",
          "name": "技术 QA 与双重人类批准绑定",
          "purpose": "区分技术 QA、视觉批准和正式入库批准，并使三者绑定准确字节版本。",
          "source_decision_ids": [
            "PD-002",
            "PD-005"
          ],
          "hypothesis_ids": [
            "HYP-002",
            "HYP-003"
          ],
          "priority": "core",
          "truth_level": "constrained_real",
          "valid_for_hypothesis": true,
          "integration_mode": "真实质检台、真实摘要和本地人类声明记录",
          "limitation": "本地人类声明可追溯但不提供密码学身份认证。",
          "disclosure": "未来云端化需要认证审批，但不得降低当前版本绑定强度。"
        },
        {
          "id": "CAP-004",
          "name": "失败关闭的正式库提升与恢复",
          "purpose": "只有当前批准有效时才复制不可变文件并最后原子更新正式清单。",
          "source_decision_ids": [
            "PD-001",
            "PD-002",
            "PD-005"
          ],
          "hypothesis_ids": [
            "HYP-002"
          ],
          "priority": "core",
          "truth_level": "constrained_real",
          "valid_for_hypothesis": true,
          "integration_mode": "真实本地 testing/production 目录、快照和提升脚本",
          "limitation": "本阶段不验证远程 CDN 上传或跨服务原子性。",
          "disclosure": "本地提升通过不等于线上目录已经部署。"
        },
        {
          "id": "CAP-005",
          "name": "持久状态与新对话恢复",
          "purpose": "让执行者从仓库确定当前状态、阻塞和下一动作并遵守发布边界。",
          "source_decision_ids": [
            "PD-001",
            "PD-006"
          ],
          "hypothesis_ids": [
            "HYP-003"
          ],
          "priority": "core",
          "truth_level": "constrained_real",
          "valid_for_hypothesis": true,
          "integration_mode": "仓库内 AGENTS、运行手册、政策、状态文件和确定性状态命令",
          "limitation": "只对能够访问同一项目目录和本地运行时的执行者有效。",
          "disclosure": "它不保证任意无文件访问权的聊天自动获得项目知识。"
        },
        {
          "id": "CAP-006",
          "name": "零绿幕完整样机合成",
          "purpose": "以完整样机底图和显式孔径数据替代所有色键板，并让 testing、production、质检台、插件与导出共享一条无色键渲染路径。",
          "source_decision_ids": [
            "PD-007"
          ],
          "hypothesis_ids": [
            "HYP-004"
          ],
          "priority": "core",
          "truth_level": "constrained_real",
          "valid_for_hypothesis": true,
          "integration_mode": "真实 catalog 图像、显式屏幕孔径/遮罩、共享 Canvas 渲染器和真实 Figma 插件构建",
          "limitation": "本阶段验证当前目录中的显示器、手机和笔记本静态栅格样机，不宣称覆盖任意复杂透明材质或动态三维场景。",
          "disclosure": "自动像素检查不能单独证明审美完整，必须与准确 revision 的人类视觉检查共同通过。"
        }
      ],
      "requirements": [
        {
          "id": "REQ-001",
          "capability_id": "CAP-001",
          "source_decision_ids": [
            "PD-001",
            "PD-003"
          ],
          "statement": "流水线 SHALL 在候选导入前记录参考摘要和人类声明的权利模式，并对 reference-only 禁止复用参考图字节。",
          "rationale": "来源和权利未知不能被自动化推定为可发布。",
          "priority": "must",
          "verification_method": "test",
          "touchpoint_ids": [
            "TP-001",
            "TP-003",
            "TP-005"
          ],
          "scenarios": [
            {
              "id": "SCN-001",
              "kind": "happy_path",
              "given": [
                "有效参考文件",
                "有效人类权利声明"
              ],
              "when": "执行候选导入",
              "then": [
                "状态记录参考摘要和权利模式",
                "候选进入 CANDIDATE_READY"
              ]
            },
            {
              "id": "SCN-002",
              "kind": "failure",
              "given": [
                "权利模式缺失或 reference-only 复用参考图字节"
              ],
              "when": "执行候选导入",
              "then": [
                "操作失败并给出明确原因",
                "测试 manifest 和既有文件不变"
              ]
            }
          ],
          "task_ids": [
            "TASK-002",
            "TASK-006"
          ]
        },
        {
          "id": "REQ-002",
          "capability_id": "CAP-002",
          "source_decision_ids": [
            "PD-004",
            "PD-005"
          ],
          "statement": "流水线 SHALL 确定性生成或核验 assetId、revision、尺寸、缩略图、摘要、分类和标签，并在写入前完成冲突检查。",
          "rationale": "插件识别、缓存、批准和不可变文件依赖稳定身份与真实元数据。",
          "priority": "must",
          "verification_method": "test",
          "touchpoint_ids": [
            "TP-001",
            "TP-003",
            "TP-005"
          ],
          "scenarios": [
            {
              "id": "SCN-003",
              "kind": "happy_path",
              "given": [
                "有效基础图",
                "受控分类",
                "合法屏幕几何"
              ],
              "when": "创建新样机",
              "then": [
                "自动生成完整素材包和清单项",
                "所有摘要与真实文件一致"
              ]
            },
            {
              "id": "SCN-004",
              "kind": "edge",
              "given": [
                "未知分类、非法 ID 或相同不可变路径不同字节"
              ],
              "when": "创建或更新样机",
              "then": [
                "操作失败关闭",
                "不会创建新分类或覆盖既有文件"
              ]
            }
          ],
          "task_ids": [
            "TASK-002",
            "TASK-006"
          ]
        },
        {
          "id": "REQ-003",
          "capability_id": "CAP-003",
          "source_decision_ids": [
            "PD-002",
            "PD-005"
          ],
          "statement": "视觉批准 SHALL 由确定的人类绑定 assetId、revision 和 candidateSha256；候选字节变化后旧批准失效。",
          "rationale": "视觉认可必须对应实际进入质检的候选。",
          "priority": "must",
          "verification_method": "test",
          "touchpoint_ids": [
            "TP-001",
            "TP-002",
            "TP-003",
            "TP-005"
          ],
          "scenarios": [
            {
              "id": "SCN-005",
              "kind": "happy_path",
              "given": [
                "候选已生成",
                "决定人明确视觉通过"
              ],
              "when": "记录视觉批准",
              "then": [
                "批准绑定准确候选摘要",
                "状态进入 VISUAL_APPROVED"
              ]
            },
            {
              "id": "SCN-006",
              "kind": "failure",
              "given": [
                "批准摘要与当前候选不一致"
              ],
              "when": "尝试进入 TESTING",
              "then": [
                "操作被拒绝",
                "旧批准保留为历史但不再 current"
              ]
            }
          ],
          "task_ids": [
            "TASK-003",
            "TASK-006"
          ]
        },
        {
          "id": "REQ-004",
          "capability_id": "CAP-003",
          "source_decision_ids": [
            "PD-002",
            "PD-005"
          ],
          "statement": "正式入库批准 SHALL 只在技术 QA 通过后由确定的人类记录，并绑定当前 itemSha256 与 qaReportSha256。",
          "rationale": "机器检查与人类产品决定必须同时存在且不能指向不同版本。",
          "priority": "must",
          "verification_method": "test",
          "touchpoint_ids": [
            "TP-002",
            "TP-003",
            "TP-004",
            "TP-005"
          ],
          "scenarios": [
            {
              "id": "SCN-007",
              "kind": "happy_path",
              "given": [
                "当前技术 QA 有效",
                "决定人明确批准正式入库"
              ],
              "when": "记录 release approval",
              "then": [
                "记录包含人类、时间、item 和 QA 摘要",
                "状态进入 RELEASE_APPROVED"
              ]
            },
            {
              "id": "SCN-008",
              "kind": "failure",
              "given": [
                "QA 缺失、失败、过期或人类决定缺失"
              ],
              "when": "记录批准或执行提升",
              "then": [
                "操作被拒绝",
                "正式 manifest 不变"
              ]
            }
          ],
          "task_ids": [
            "TASK-003",
            "TASK-004",
            "TASK-006"
          ]
        },
        {
          "id": "REQ-005",
          "capability_id": "CAP-004",
          "source_decision_ids": [
            "PD-001",
            "PD-002",
            "PD-005"
          ],
          "statement": "提升 SHALL 先验证双重批准并完成快照、不可变文件复制和摘要核验，最后原子更新正式 manifest；失败时旧正式库保持可用。",
          "rationale": "避免清单先更新、文件缺失或半次提升污染插件读取。",
          "priority": "must",
          "verification_method": "test",
          "touchpoint_ids": [
            "TP-004",
            "TP-005"
          ],
          "scenarios": [
            {
              "id": "SCN-009",
              "kind": "happy_path",
              "given": [
                "双重批准均为当前版本",
                "目标不可变路径无冲突"
              ],
              "when": "提升单个样机",
              "then": [
                "素材和批准记录进入正式库",
                "catalogVersion 递增且正式检查通过"
              ]
            },
            {
              "id": "SCN-010",
              "kind": "recovery",
              "given": [
                "复制冲突、摘要漂移或中途失败"
              ],
              "when": "提升失败后修复并重试",
              "then": [
                "失败期间旧正式 manifest 可用",
                "修复后可从明确状态安全重试"
              ]
            }
          ],
          "task_ids": [
            "TASK-004",
            "TASK-006"
          ]
        },
        {
          "id": "REQ-006",
          "capability_id": "CAP-005",
          "source_decision_ids": [
            "PD-006"
          ],
          "statement": "仓库 SHALL 持久记录每个资产的当前状态、摘要、阻塞原因、历史决定和唯一下一动作，并提供新对话可执行的状态命令与运行手册。",
          "rationale": "执行连续性必须来自可检查状态而非聊天记忆。",
          "priority": "must",
          "verification_method": "user_research",
          "touchpoint_ids": [
            "TP-001",
            "TP-003",
            "TP-005",
            "TP-006"
          ],
          "scenarios": [
            {
              "id": "SCN-011",
              "kind": "recovery",
              "given": [
                "新执行对话没有旧聊天上下文",
                "仓库包含中途停止的资产"
              ],
              "when": "执行合同和状态检查",
              "then": [
                "准确报告当前状态和阻塞",
                "只执行政策允许的下一动作"
              ]
            },
            {
              "id": "SCN-012",
              "kind": "failure",
              "given": [
                "状态摘要与实际文件不一致"
              ],
              "when": "执行恢复检查",
              "then": [
                "状态标记 BLOCKED 或失效",
                "不会依据旧聊天或旧批准继续"
              ]
            }
          ],
          "task_ids": [
            "TASK-005",
            "TASK-006"
          ]
        },
        {
          "id": "REQ-007",
          "capability_id": "CAP-005",
          "source_decision_ids": [
            "PD-001"
          ],
          "statement": "本阶段工具和文档 SHALL 保持 GitHub、Netlify、Figma 社区与其他外部部署为禁止状态，除非未来合同变更并重新批准。",
          "rationale": "当前授权只覆盖本地实现和验证。",
          "priority": "must",
          "verification_method": "inspection",
          "touchpoint_ids": [
            "TP-003",
            "TP-005",
            "TP-006"
          ],
          "scenarios": [
            {
              "id": "SCN-013",
              "kind": "failure",
              "given": [
                "本阶段调用部署或发布动作"
              ],
              "when": "政策校验运行",
              "then": [
                "校验失败并指出未授权边界",
                "不执行外部操作"
              ]
            }
          ],
          "task_ids": [
            "TASK-001",
            "TASK-005",
            "TASK-006"
          ]
        },
        {
          "id": "REQ-008",
          "capability_id": "CAP-006",
          "source_decision_ids": [
            "PD-007"
          ],
          "statement": "流水线 SHALL 只接收自身已是完整样机的候选底图和缩略图，并 SHALL 拒绝色键字段、色键模式、典型绿幕占位屏或依赖运行时隐藏占位板才完整的素材。",
          "rationale": "完整性必须从候选进入系统时成立，不能靠插件缩略图或最终合成掩盖不合格底图。",
          "priority": "must",
          "verification_method": "test",
          "touchpoint_ids": [
            "TP-001",
            "TP-002",
            "TP-003",
            "TP-005"
          ],
          "scenarios": [
            {
              "id": "SCN-014",
              "kind": "happy_path",
              "given": [
                "完整非色键候选底图",
                "显式屏幕孔径几何",
                "完整缩略图"
              ],
              "when": "候选导入并进入视觉审核",
              "then": [
                "底图和缩略图在不运行替换算法时均可直接展示",
                "自动完整性检查和人类完整样机检查均可独立执行"
              ]
            },
            {
              "id": "SCN-015",
              "kind": "failure",
              "given": [
                "manifest 含色键字段或模式",
                "屏幕区域呈典型高占比绿幕占位",
                "缩略图与底图完整性不一致"
              ],
              "when": "导入、目录检查、技术 QA 或提升任一门禁运行",
              "then": [
                "操作失败关闭并指出具体不合格项",
                "不生成视觉批准、技术 QA 或正式入库资格"
              ]
            }
          ],
          "task_ids": [
            "TASK-007",
            "TASK-008",
            "TASK-009",
            "TASK-010"
          ]
        },
        {
          "id": "REQ-009",
          "capability_id": "CAP-006",
          "source_decision_ids": [
            "PD-007"
          ],
          "statement": "共享渲染器 SHALL 仅依据显式屏幕孔径几何/遮罩投影用户画面，并 SHALL 删除按底图颜色推断孔径、清除色溢或扩张色键边缘的全部代码和兼容分支。",
          "rationale": "单一数据驱动合成路径能让编辑坐标、可见边界、裁切、命中测试和导出保持一致，并从根上消除绿幕与色溢。",
          "priority": "must",
          "verification_method": "test",
          "touchpoint_ids": [
            "TP-002",
            "TP-005",
            "TP-007"
          ],
          "scenarios": [
            {
              "id": "SCN-016",
              "kind": "happy_path",
              "given": [
                "完整样机底图",
                "显式孔径几何或遮罩",
                "任意批准测试画面"
              ],
              "when": "质检台、插件或导出调用共享渲染器",
              "then": [
                "用户画面只出现在显式孔径内",
                "遮挡与反射按声明图层恢复",
                "所有入口产生同一合成结果"
              ]
            },
            {
              "id": "SCN-017",
              "kind": "edge",
              "given": [
                "300% 缩放、裁切边界、自由透视和高对比测试画面"
              ],
              "when": "执行最终合成和逐像素边界检查",
              "then": [
                "孔径外用户像素为零",
                "孔径边缘没有绿幕、露底、可见缝或锯齿扩张",
                "选择框、命中区域和最终像素边界一致"
              ]
            }
          ],
          "task_ids": [
            "TASK-007",
            "TASK-009"
          ]
        },
        {
          "id": "REQ-010",
          "capability_id": "CAP-006",
          "source_decision_ids": [
            "PD-005",
            "PD-007"
          ],
          "statement": "四个现有正式样机和 workstation-display-three-quarter SHALL 以新 revision 迁移为完整非色键样机；旧绿幕 revision SHALL 从所有活动清单和服务路径撤下，且其旧批准 SHALL 仅保留为不可复用的历史。",
          "rationale": "只修改新候选会让正式库继续违反硬规则；覆盖旧字节又会破坏版本与批准追踪。",
          "priority": "must",
          "verification_method": "demonstration",
          "touchpoint_ids": [
            "TP-001",
            "TP-002",
            "TP-003",
            "TP-004",
            "TP-005",
            "TP-007"
          ],
          "scenarios": [
            {
              "id": "SCN-018",
              "kind": "recovery",
              "given": [
                "活动目录含五个不合格绿幕 r1",
                "旧批准绑定 r1 摘要"
              ],
              "when": "执行零绿幕迁移",
              "then": [
                "每个样机产生独立 r2 并重新完成视觉、技术和正式批准",
                "活动清单不再引用 r1",
                "r1 历史记录不能通过当前门禁"
              ]
            },
            {
              "id": "SCN-019",
              "kind": "failure",
              "given": [
                "任一旧绿幕文件仍被活动 manifest、插件、质检台或提升脚本引用"
              ],
              "when": "目录检查或发布检查运行",
              "then": [
                "检查失败并列出残留引用",
                "不得声称迁移完成或继续正式提升"
              ]
            }
          ],
          "task_ids": [
            "TASK-008",
            "TASK-009",
            "TASK-010"
          ]
        }
      ],
      "implementation_plan": {
        "vertical_slice": {
          "capability_ids": [
            "CAP-001",
            "CAP-002",
            "CAP-003",
            "CAP-004",
            "CAP-005",
            "CAP-006"
          ],
          "requirement_ids": [
            "REQ-001",
            "REQ-002",
            "REQ-003",
            "REQ-004",
            "REQ-005",
            "REQ-006",
            "REQ-007",
            "REQ-008",
            "REQ-009",
            "REQ-010"
          ],
          "touchpoint_ids": [
            "TP-001",
            "TP-002",
            "TP-003",
            "TP-004",
            "TP-005",
            "TP-006",
            "TP-007"
          ],
          "completion_rule": "旧色键架构与活动绿幕 revision 全部撤出；五个现有样机完成 r2 零绿幕迁移和准确版本复审；一个全新完整样机从参考记录完成到 PROMOTED 的真实闭环；全部 fixture 与渲染场景产生当前 L1/L2/L3/L4 证据；新执行对话完成恢复观察；无开放高/严重发现；PASS_CANDIDATE 后由决定人批准准确验收指纹。"
        },
        "touchpoints": [
          {
            "id": "TP-001",
            "kind": "automation",
            "name": "样机流水线命令",
            "requirement_ids": [
              "REQ-001",
              "REQ-002",
              "REQ-003",
              "REQ-006",
              "REQ-008",
              "REQ-010"
            ],
            "states": [
              "ready",
              "running",
              "complete",
              "failed",
              "blocked"
            ],
            "file_refs": [
              "scripts/asset-pipeline.mjs",
              "scripts/lib/asset-pipeline.mjs",
              "package.json",
              "pnpm-lock.yaml"
            ]
          },
          {
            "id": "TP-002",
            "kind": "screen",
            "name": "样机质检台",
            "requirement_ids": [
              "REQ-003",
              "REQ-004",
              "REQ-008",
              "REQ-009",
              "REQ-010"
            ],
            "states": [
              "loading",
              "testing",
              "qa_failed",
              "qa_passed",
              "awaiting_release_approval",
              "release_approved",
              "error"
            ],
            "file_refs": [
              "asset-lab/index.html",
              "asset-lab/styles.css",
              "asset-lab/app.js",
              "scripts/serve-catalog.mjs"
            ]
          },
          {
            "id": "TP-003",
            "kind": "data",
            "name": "流水线政策与持久状态",
            "requirement_ids": [
              "REQ-001",
              "REQ-002",
              "REQ-003",
              "REQ-004",
              "REQ-006",
              "REQ-007",
              "REQ-008",
              "REQ-010"
            ],
            "states": [
              "valid",
              "invalid",
              "current",
              "stale",
              "blocked"
            ],
            "file_refs": [
              "quality/asset-pipeline-policy.json",
              "scripts/lib/asset-pipeline.mjs"
            ]
          },
          {
            "id": "TP-004",
            "kind": "integration",
            "name": "批准与正式库提升",
            "requirement_ids": [
              "REQ-004",
              "REQ-005",
              "REQ-010"
            ],
            "states": [
              "not_authorized",
              "authorized",
              "promoting",
              "promoted",
              "failed",
              "recoverable"
            ],
            "file_refs": [
              "scripts/authorize-mockup.mjs",
              "scripts/promote-mockup.mjs",
              "scripts/catalog-release.mjs",
              "shared/catalog-contract.js",
              "scripts/lib/asset-pipeline.mjs"
            ]
          },
          {
            "id": "TP-005",
            "kind": "test",
            "name": "机器门禁与回归测试",
            "requirement_ids": [
              "REQ-001",
              "REQ-002",
              "REQ-003",
              "REQ-004",
              "REQ-005",
              "REQ-006",
              "REQ-007",
              "REQ-008",
              "REQ-009",
              "REQ-010"
            ],
            "states": [
              "not_run",
              "pass",
              "fail",
              "inconclusive"
            ],
            "file_refs": [
              "scripts/verify-asset-pipeline-contract.mjs",
              "tests/asset-pipeline-contract.test.mjs",
              "tests/asset-pipeline.test.mjs",
              "tests/catalog.test.mjs"
            ]
          },
          {
            "id": "TP-006",
            "kind": "content",
            "name": "新对话入口与运行手册",
            "requirement_ids": [
              "REQ-006",
              "REQ-007"
            ],
            "states": [
              "current",
              "stale",
              "blocked"
            ],
            "file_refs": [
              "AGENTS.md",
              "docs/ASSET_PIPELINE_RUNBOOK.md",
              "README.md"
            ]
          },
          {
            "id": "TP-007",
            "kind": "integration",
            "name": "显式孔径共享渲染器与活动样机目录",
            "requirement_ids": [
              "REQ-009",
              "REQ-010"
            ],
            "states": [
              "legacy_chroma_blocked",
              "migration_pending",
              "aperture_renderer_ready",
              "assets_migrated",
              "verified",
              "failed"
            ],
            "file_refs": [
              "shared/mockup-renderer.js",
              "plugin/code.js",
              "plugin/ui.js"
            ]
          }
        ],
        "tasks": [
          {
            "id": "TASK-001",
            "requirement_ids": [
              "REQ-007"
            ],
            "touchpoint_ids": [
              "TP-003",
              "TP-005"
            ],
            "description": "实现机器政策校验器并把未授权外部发布设为失败关闭。",
            "file_refs": [
              "scripts/verify-asset-pipeline-contract.mjs",
              "quality/asset-pipeline-policy.json",
              "package.json"
            ],
            "test_refs": [
              "tests/asset-pipeline-contract.test.mjs"
            ]
          },
          {
            "id": "TASK-002",
            "requirement_ids": [
              "REQ-001",
              "REQ-002"
            ],
            "touchpoint_ids": [
              "TP-001",
              "TP-003",
              "TP-005"
            ],
            "description": "实现参考记录、原子素材导入、缩略图、自动身份/revision/尺寸/摘要和受控分类。",
            "file_refs": [
              "scripts/asset-pipeline.mjs",
              "scripts/lib/asset-pipeline.mjs",
              "package.json",
              "pnpm-lock.yaml"
            ],
            "test_refs": [
              "tests/asset-pipeline.test.mjs"
            ]
          },
          {
            "id": "TASK-003",
            "requirement_ids": [
              "REQ-003",
              "REQ-004"
            ],
            "touchpoint_ids": [
              "TP-001",
              "TP-002",
              "TP-003",
              "TP-005"
            ],
            "description": "实现视觉批准、技术 QA 和正式入库批准的分离记录与过期检测。",
            "file_refs": [
              "scripts/authorize-mockup.mjs",
              "scripts/serve-catalog.mjs",
              "asset-lab/index.html",
              "asset-lab/styles.css",
              "asset-lab/app.js",
              "scripts/lib/asset-pipeline.mjs"
            ],
            "test_refs": [
              "tests/asset-pipeline.test.mjs"
            ]
          },
          {
            "id": "TASK-004",
            "requirement_ids": [
              "REQ-004",
              "REQ-005"
            ],
            "touchpoint_ids": [
              "TP-004",
              "TP-005"
            ],
            "description": "强化正式库提升，强制 release approval、原子顺序、摘要复核与恢复语义。",
            "file_refs": [
              "scripts/promote-mockup.mjs",
              "scripts/catalog-release.mjs",
              "shared/catalog-contract.js",
              "scripts/lib/asset-pipeline.mjs"
            ],
            "test_refs": [
              "tests/asset-pipeline.test.mjs",
              "tests/catalog.test.mjs"
            ]
          },
          {
            "id": "TASK-005",
            "requirement_ids": [
              "REQ-006",
              "REQ-007"
            ],
            "touchpoint_ids": [
              "TP-001",
              "TP-003",
              "TP-006"
            ],
            "description": "创建根级执行入口、运行手册和可验证的状态/下一动作输出。",
            "file_refs": [
              "AGENTS.md",
              "docs/ASSET_PIPELINE_RUNBOOK.md",
              "README.md",
              "scripts/asset-pipeline.mjs",
              "package.json"
            ],
            "test_refs": [
              "tests/asset-pipeline.test.mjs",
              "tests/asset-pipeline-contract.test.mjs"
            ]
          },
          {
            "id": "TASK-006",
            "requirement_ids": [
              "REQ-001",
              "REQ-002",
              "REQ-003",
              "REQ-004",
              "REQ-005",
              "REQ-006",
              "REQ-007"
            ],
            "touchpoint_ids": [
              "TP-001",
              "TP-002",
              "TP-003",
              "TP-004",
              "TP-005",
              "TP-006"
            ],
            "description": "执行成功、失败、边界、恢复和现有目录回归测试，保存可摘要绑定的证据。",
            "file_refs": [
              "tests/asset-pipeline.test.mjs",
              "tests/asset-pipeline-contract.test.mjs",
              "tests/catalog.test.mjs"
            ],
            "test_refs": [
              "tests/asset-pipeline.test.mjs",
              "tests/asset-pipeline-contract.test.mjs",
              "tests/catalog.test.mjs"
            ]
          },
          {
            "id": "TASK-007",
            "requirement_ids": [
              "REQ-008",
              "REQ-009"
            ],
            "touchpoint_ids": [
              "TP-002",
              "TP-003",
              "TP-005",
              "TP-007"
            ],
            "description": "建立 catalog schema v5 与 aperture-mask 共享渲染器，删除色键检测、色溢清理、色键接缝测量和 v4 兼容分支，并同步质检、插件、缩略图和发布校验。",
            "file_refs": [
              "shared/mockup-renderer.js",
              "shared/catalog-contract.js",
              "quality/asset-pipeline-policy.json",
              "scripts/lib/asset-pipeline.mjs",
              "scripts/serve-catalog.mjs",
              "scripts/catalog-release.mjs",
              "scripts/generate-catalog-thumbnails.mjs",
              "scripts/build-plugin.mjs",
              "asset-lab/app.js",
              "plugin/code.js",
              "plugin/ui.js",
              "docs/ARCHITECTURE.md",
              "docs/ASSET_PIPELINE_RUNBOOK.md"
            ],
            "test_refs": [
              "tests/catalog.test.mjs",
              "tests/plugin.test.mjs",
              "tests/asset-pipeline.test.mjs",
              "tests/asset-pipeline-contract.test.mjs"
            ]
          },
          {
            "id": "TASK-008",
            "requirement_ids": [
              "REQ-008",
              "REQ-010"
            ],
            "touchpoint_ids": [
              "TP-001",
              "TP-003",
              "TP-004",
              "TP-007"
            ],
            "description": "用确定性迁移工具为四个现有正式样机和 workstation-display-three-quarter 生成完整非色键 r2，撤下活动 r1 引用并使所有旧批准不可复用。",
            "file_refs": [
              "scripts/migrate-chroma-catalog-v5.mjs",
              "scripts/lib/asset-pipeline.mjs",
              "scripts/promote-mockup.mjs",
              "scripts/catalog-release.mjs"
            ],
            "test_refs": [
              "tests/catalog-migration.test.mjs",
              "tests/asset-pipeline.test.mjs"
            ]
          },
          {
            "id": "TASK-009",
            "requirement_ids": [
              "REQ-008",
              "REQ-009",
              "REQ-010"
            ],
            "touchpoint_ids": [
              "TP-002",
              "TP-005",
              "TP-007"
            ],
            "description": "增加零色键静态扫描、典型绿幕占位拒绝、显式孔径逐像素边界测试、五个 r2 多场景回归和活动目录残留引用检查。",
            "file_refs": [
              "scripts/verify-no-chroma.mjs",
              "scripts/verify-asset-pipeline-contract.mjs",
              "tests/no-chroma.test.mjs",
              "tests/catalog-migration.test.mjs",
              "tests/catalog.test.mjs",
              "tests/plugin.test.mjs",
              "tests/asset-pipeline.test.mjs"
            ],
            "test_refs": [
              "tests/no-chroma.test.mjs",
              "tests/catalog-migration.test.mjs",
              "tests/catalog.test.mjs",
              "tests/plugin.test.mjs",
              "tests/asset-pipeline.test.mjs"
            ]
          },
          {
            "id": "TASK-010",
            "requirement_ids": [
              "REQ-008",
              "REQ-010"
            ],
            "touchpoint_ids": [
              "TP-001",
              "TP-002",
              "TP-003",
              "TP-004",
              "TP-005",
              "TP-007"
            ],
            "description": "在五个迁移 r2 分别取得准确视觉结论后，用一个全新完整非绿幕候选执行导入、视觉批准、技术 QA、正式入库批准和原子提升的真实闭环。",
            "file_refs": [
              "scripts/asset-pipeline.mjs",
              "scripts/authorize-mockup.mjs",
              "scripts/serve-catalog.mjs",
              "scripts/promote-mockup.mjs"
            ],
            "test_refs": [
              "tests/asset-pipeline.test.mjs",
              "tests/no-chroma.test.mjs"
            ]
          }
        ]
      },
      "changes": [
        {
          "id": "CHG-001",
          "contract_version": 2,
          "operation": "modified",
          "status": "reconciled",
          "reason": "将会变化的实现文件从不可变来源证据改为独立实施前仓库基线，并补齐依赖、UI、目录验证、文档和回归测试文件的实施封印范围。",
          "source_ids": [
            "SRC-001"
          ],
          "impacted_ids": [
            "SRC-004",
            "SRC-005",
            "SRC-006",
            "SRC-007",
            "REQ-001",
            "REQ-002",
            "REQ-003",
            "REQ-004",
            "REQ-005",
            "REQ-006",
            "REQ-007",
            "TASK-001",
            "TASK-002",
            "TASK-003",
            "TASK-004",
            "TASK-005",
            "TASK-006"
          ],
          "superseded_ids": [],
          "author": {
            "type": "agent",
            "identity": "Codex",
            "role": "实施与合同维护者"
          },
          "changed_at": "2026-10-31T12:08:00+08:00",
          "approval_impact": "baseline_and_build"
        },
        {
          "id": "CHG-002",
          "contract_version": 3,
          "operation": "modified",
          "status": "reconciled",
          "reason": "决定人将零绿幕和完整样机提升为绝对硬规则；只读审计证明问题横跨所有活动底图、catalog schema、共享渲染器、质检与发布链，因此必须从最高层统一替换色键架构并迁移全部活动 revision。",
          "source_ids": [
            "SRC-008",
            "SRC-009"
          ],
          "impacted_ids": [
            "OUT-004",
            "PD-007",
            "CON-004",
            "HYP-004",
            "MET-007",
            "MET-008",
            "CAP-006",
            "REQ-002",
            "REQ-003",
            "REQ-004",
            "REQ-005",
            "REQ-006",
            "REQ-008",
            "REQ-009",
            "REQ-010",
            "TP-001",
            "TP-002",
            "TP-003",
            "TP-004",
            "TP-005",
            "TP-007",
            "TASK-002",
            "TASK-003",
            "TASK-004",
            "TASK-005",
            "TASK-006",
            "TASK-007",
            "TASK-008",
            "TASK-009",
            "TASK-010",
            "FND-AP-001"
          ],
          "superseded_ids": [],
          "author": {
            "type": "human",
            "identity": "Wang Zhentao",
            "role": "产品决定人、视觉审核人、正式入库决定人"
          },
          "changed_at": "2026-10-31T12:39:19+08:00",
          "approval_impact": "baseline_and_build"
        },
        {
          "id": "CHG-003",
          "contract_version": 3,
          "operation": "modified",
          "status": "reconciled",
          "reason": "修正合同来源绑定漏洞：活动机器政策是本次实施的明确修改对象，不能同时充当不可变批准来源；将其替换为实施前冻结基线，不改变零绿幕目标、范围、需求、任务或验收门槛。",
          "source_ids": [
            "SRC-003"
          ],
          "impacted_ids": [
            "SRC-003",
            "HYP-001",
            "MET-001",
            "MET-002",
            "MET-003",
            "MET-004"
          ],
          "superseded_ids": [],
          "author": {
            "type": "agent",
            "identity": "Codex",
            "role": "实施与合同维护者"
          },
          "changed_at": "2026-10-31T13:02:00+08:00",
          "approval_impact": "build"
        }
      ]
    }

</details>
