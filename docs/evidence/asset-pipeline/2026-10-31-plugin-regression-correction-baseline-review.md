# Spec-to-Demo review packet

- Handoff: `S2D-836f9e36f083`
- Schema: `3.0.0`
- Contract version: `5`
- Implementation revision: `tree:sha256:6a332b5157beaf93dd2f71a8adcc40816f7fc3c4c88ae19d0ef4df434d026083`
- Stage: `awaiting_baseline_approval`
- Baseline fingerprint: `sha256:d1d5b3a437716abe54107e9d4575d7ac4b0b6ff5ae0a262d30a3135f9250eef2`
- Build fingerprint: `sha256:2f01ac3e4bac6dd090f4fca040ac4838088c13dfd202893ede8d1128cd6e4671`
- Acceptance fingerprint: `sha256:07a5ed29a7d1b06830eb6a88260e3d6fa438facdc25a3e8d5a9e2e4db4a6eedb`

> Fingerprints prove review binding only. They do not prove implementation quality, product value, or final acceptance.

## Product baseline

**Problem:** 现有样机系统曾把创作授权、素材内容、渲染孔径、裁切几何和交互反馈分散在多套局部机制中：它不仅曾允许未经委托的候选进入测试库，还在已声称通过自动门禁后，于真实 Figma 宿主再现悬停抖动、单边拖拽变成双轴缩放、平行圆角边界、彩色角块泄漏和未经授权的默认界面，证明旧验收未覆盖真实交互不变量和最终像素来源。

### Sources

- **SRC-001** `user_statement` — 决定人批准截图输入、AI执行、双重门禁、本地优先和仓库交接的样机生产方案。; locator `docs/ASSET_PIPELINE_AUTHORITY_2026-10-31.md`; digest `sha256:03593fdd588d053d2d1e8c608c713c00f77728b5fc2d188048f44650bcf67d75`
- **SRC-002** `repository_evidence` — 当前人类可读资产流水线合同。; locator `docs/ASSET_PIPELINE_DEVELOPMENT_CONTRACT.md`; digest `sha256:6fb219fcca1d4365a451e27de0f762f89422ad28bf26ad4e1a2cbf0b3591f7a7`
- **SRC-004** `repository_evidence` — 实施前 README 证明当前流程从手工放置测试素材开始，四个素材均为临时测试内容。; locator `docs/ASSET_PIPELINE_REPOSITORY_BASELINE_2026-10-31.md`; digest `sha256:b06539b388693106743cceef156fc99530788c47201559c269c99863bf104a00`
- **SRC-005** `repository_evidence` — 实施前质检服务只有几何保存和 QA 批准写入接口，没有新增样机入口。; locator `docs/ASSET_PIPELINE_REPOSITORY_BASELINE_2026-10-31.md`; digest `sha256:b06539b388693106743cceef156fc99530788c47201559c269c99863bf104a00`
- **SRC-006** `repository_evidence` — 实施前提升脚本校验技术 QA 摘要并复制到正式库，但没有独立人类 release approval。; locator `docs/ASSET_PIPELINE_REPOSITORY_BASELINE_2026-10-31.md`; digest `sha256:b06539b388693106743cceef156fc99530788c47201559c269c99863bf104a00`
- **SRC-007** `repository_evidence` — 实施前目录合同强制分类、revision、项目自制来源、摘要和正式 QA 元数据。; locator `docs/ASSET_PIPELINE_REPOSITORY_BASELINE_2026-10-31.md`; digest `sha256:b06539b388693106743cceef156fc99530788c47201559c269c99863bf104a00`
- **SRC-008** `user_statement` — 决定人明确要求所有样机绝对禁止绿幕效果，候选、底图、缩略图和最终结果都必须是完整样机。; locator `docs/ASSET_PIPELINE_NO_GREENSCREEN_DECISION_2026-10-31.md`; digest `sha256:fb53594c26cce1bbd1cb3251e93d60a91ab611e86741a48a89f5a1d6d8dcf52d`
- **SRC-009** `repository_evidence` — 只读审计确认四个正式底图、新候选底图和共享渲染链均依赖绿幕色键，问题需要 schema、renderer、目录和素材 revision 的统一迁移。; locator `docs/ASSET_PIPELINE_NO_GREENSCREEN_DECISION_2026-10-31.md`; digest `sha256:fb53594c26cce1bbd1cb3251e93d60a91ab611e86741a48a89f5a1d6d8dcf52d`
- **SRC-010** `user_statement` — 决定人纠正了将权利声明和内部验收任务当成新候选创作授权的工作流程错误，要求彻底修正合同、状态机和程序门禁。; locator `docs/ASSET_PIPELINE_WORKFLOW_CORRECTION_2026-10-31.md`; digest `sha256:388709f840ac6e05475f111feb0291edbbd0e891ede5ce421878b37226ab26ce`
- **SRC-011** `user_statement` — 决定人在真实 Figma 插件中提交六项回归证据，要求从全局结构纠正悬停抖动、裁切轴向、圆角边界、彩色角块、默认画面来源和 QA 漏洞。; locator `docs/PLUGIN_REGRESSION_CORRECTION_2026-10-31.md`; digest `sha256:c4c538dc82d8ff91f35b095950df0ac7b0ee8502185774213bf34242c7148554`

### Target users

- **USR-001** — 只提供参考截图、权利声明和审核决定的产品/视觉决定人。
- **USR-002** — 在拥有项目文件和必要本地工具的会话中执行制作、导入、质检和提升的 AI/工程执行代理。

### Desired outcomes

- **OUT-001** — 决定人只承担单次创作委托、参考权利、视觉方向和正式入库决定，其他确定性步骤由代理和系统完成。; success: 任何新候选都能回溯到决定人对准确参考图发起的单次委托；没有委托时系统停在 WAITING_FOR_USER_INPUT。
- **OUT-002** — 只有技术 QA 与准确版本的人类批准同时有效时，样机才能进入正式库。; success: 缺失、过期、摘要不匹配或针对其他 revision 的任一批准都会被提升脚本拒绝，正式库保持不变。
- **OUT-003** — 新对话可仅依靠仓库内权威和状态继续工作，不依赖旧聊天记忆。; success: 无旧对话上下文的执行者能识别当前资产状态、阻塞原因和唯一下一动作。
- **OUT-004** — 所有活动样机从候选底图开始就是完整可展示的样机，制作与运行链路完全不使用绿幕或色键替换。; success: testing 与 production 的每个当前底图、缩略图和质检结果均无绿幕占位；schema、renderer、插件构建和服务路径均不存在色键字段、代码或回退分支。
- **OUT-005** — 真实插件中的悬停、裁切、孔径遮罩和屏幕内容使用同一组可执行不变量，不再依赖局部视觉补丁。; success: 真实 Figma+EX 宿主中反复悬停无几何抖动；右边拖拽只改变水平轴、下边拖拽只改变垂直轴；默认屏幕没有未授权界面或彩色角块；缺失来源、摘要错配或色度超限均失败关闭。

### Decisions

- **PD-001** `confirmed` — 先实现并验证本地完整流水线，再讨论 GitHub、Netlify、云后台或 Figma 社区发布。; rationale: 避免把尚未稳定的流程搬到线上并扩大数据、权限和恢复风险。
- **PD-002** `confirmed` — 采用机器技术门禁与人类准确版本批准的双重入库机制，任何一方都不能替代另一方。; rationale: 审美决定不能证明文件完整和技术正确，自动检查也不能替代人类产品决定。
- **PD-003** `confirmed` — 参考图必须由人类声明 owned、authorized 或 reference-only，系统不得自行推定权利。; rationale: AI和代码不能验证法律权利；没有声明时必须失败关闭。
- **PD-004** `confirmed` — 自动分类只能映射到受控 taxonomy；未知分类阻塞流转而不是自动创建同义分类。; rationale: 保持插件筛选、搜索和长期资产治理一致。
- **PD-005** `confirmed` — 批准和提升绑定稳定 assetId、正整数 revision 和当前 itemSha256；任何内容变化使旧批准失效。; rationale: 防止批准一个版本却发布另一个版本。
- **PD-006** `confirmed` — 用仓库内合同、政策、运行手册、工作状态和确定性命令完成新对话交接。; rationale: 对话记忆不是可靠的工程状态或批准记录。
- **PD-007** `confirmed` — 所有活动样机绝对禁止绿幕和任何色键替换；统一采用完整样机底图、显式屏幕孔径几何/遮罩及可选前景与反射层，且不保留旧色键兼容路径。; rationale: 完整样机必须在任何预览入口都可信，屏幕边界必须来自稳定的显式数据而不是容易产生色溢、接缝和错误缩略图的像素颜色。
- **PD-008** `confirmed` — 参考图权利声明与候选创作委托必须分离；每个候选必须绑定一份单次、最多一个候选、精确参考摘要的人类委托，没有委托时必须停在 WAITING_FOR_USER_INPUT。; rationale: “可以使用这张图”不能推导出“现在要基于它再创建一个候选”；程序必须阻止内部验收任务越权生产真实素材。
- **PD-009** `confirmed` — 插件交互、裁切几何和屏幕内容来源必须以共享不变量统一治理；禁止用随机旋转、平行几何算法、固定外层圆角或未经参考绑定的默认界面制造视觉效果。; rationale: 用户真实宿主证据证明旧局部验收没有覆盖命中几何、轴向约束、最终像素和内容来源，导致同类问题反复回归。

### Non-goals

- **NG-001** — 本阶段不内置第三方图片生成 API、不保存模型密钥，也不证明任意截图都能自动生成高质量样机。
- **NG-002** — 本阶段不执行 GitHub、Netlify、Figma 社区或其他公网发布。
- **NG-003** — 本阶段不把四个 temporary-test 素材宣称为最终正式内容。

### Constraints

- **CON-001** `immovable` — 保留当前工作区全部既有未提交修改，不重置、不覆盖无关成果。
- **CON-002** `immovable` — 自动化只能产生 PASS_CANDIDATE；最终验收和每个资产的正式入库必须由确定的人类决定。
- **CON-003** `immovable` — 优先复用现有 catalog contract、质检台、批准报告、快照和提升机制，避免创建平行正式库。
- **CON-004** `immovable` — 候选底图、测试库、正式库、缩略图、质检台、插件和导出链均不得把绿色或任何色键颜色作为待替换屏幕；旧绿幕 revision 不得继续作为活动素材或沿用任何批准。
- **CON-005** `immovable` — 内部测试、合同待办、旧截图或权利声明都不得代替当次单次人类创作委托；端到端工程验收应使用隔离 fixture 或等待真实委托。
- **CON-006** `immovable` — 卡片悬停不得改变命中几何；裁切单边只改变对应轴并固定对边；默认画面不得生成未经授权内容；QA 必须验证屏幕来源和最终像素泄漏。

### Open questions

- **Q-001** `resolved` critical=`True` — 参考图权利如何处理？; resolution: 每个资产由人类在 owned、authorized、reference-only 中明确选择；未选择时阻塞，reference-only 不复用参考图字节。
- **Q-002** `resolved` critical=`False` — 用于最终真实闭环的第一张样机参考截图是哪一张？; resolution: 不再为内部验收寻找或复用截图；五个 r2 闭环已完成，未来新候选只能来自决定人的下一次明确委托。

### Baseline approval

- Status: `pending`
- Human: —
- Approved at: `—`
- Recorded fingerprint: `—`


<details>
<summary>Exact baseline fingerprint payload</summary>

The concise review exposes every decision-bearing field. This is the exact hashed manifest for auditing identifiers, traces, and digests.

    {
      "schema_version": "3.0.0",
      "handoff_id": "S2D-836f9e36f083",
      "profile": "standard",
      "source_material": [
        {
          "id": "SRC-001",
          "kind": "user_statement",
          "summary": "决定人批准截图输入、AI执行、双重门禁、本地优先和仓库交接的样机生产方案。",
          "locator": "docs/ASSET_PIPELINE_AUTHORITY_2026-10-31.md",
          "content_digest": "sha256:03593fdd588d053d2d1e8c608c713c00f77728b5fc2d188048f44650bcf67d75",
          "verified": true
        },
        {
          "id": "SRC-002",
          "kind": "repository_evidence",
          "summary": "当前人类可读资产流水线合同。",
          "locator": "docs/ASSET_PIPELINE_DEVELOPMENT_CONTRACT.md",
          "content_digest": "sha256:6fb219fcca1d4365a451e27de0f762f89422ad28bf26ad4e1a2cbf0b3591f7a7",
          "verified": true
        },
        {
          "id": "SRC-004",
          "kind": "repository_evidence",
          "summary": "实施前 README 证明当前流程从手工放置测试素材开始，四个素材均为临时测试内容。",
          "locator": "docs/ASSET_PIPELINE_REPOSITORY_BASELINE_2026-10-31.md",
          "content_digest": "sha256:b06539b388693106743cceef156fc99530788c47201559c269c99863bf104a00",
          "verified": true
        },
        {
          "id": "SRC-005",
          "kind": "repository_evidence",
          "summary": "实施前质检服务只有几何保存和 QA 批准写入接口，没有新增样机入口。",
          "locator": "docs/ASSET_PIPELINE_REPOSITORY_BASELINE_2026-10-31.md",
          "content_digest": "sha256:b06539b388693106743cceef156fc99530788c47201559c269c99863bf104a00",
          "verified": true
        },
        {
          "id": "SRC-006",
          "kind": "repository_evidence",
          "summary": "实施前提升脚本校验技术 QA 摘要并复制到正式库，但没有独立人类 release approval。",
          "locator": "docs/ASSET_PIPELINE_REPOSITORY_BASELINE_2026-10-31.md",
          "content_digest": "sha256:b06539b388693106743cceef156fc99530788c47201559c269c99863bf104a00",
          "verified": true
        },
        {
          "id": "SRC-007",
          "kind": "repository_evidence",
          "summary": "实施前目录合同强制分类、revision、项目自制来源、摘要和正式 QA 元数据。",
          "locator": "docs/ASSET_PIPELINE_REPOSITORY_BASELINE_2026-10-31.md",
          "content_digest": "sha256:b06539b388693106743cceef156fc99530788c47201559c269c99863bf104a00",
          "verified": true
        },
        {
          "id": "SRC-008",
          "kind": "user_statement",
          "summary": "决定人明确要求所有样机绝对禁止绿幕效果，候选、底图、缩略图和最终结果都必须是完整样机。",
          "locator": "docs/ASSET_PIPELINE_NO_GREENSCREEN_DECISION_2026-10-31.md",
          "content_digest": "sha256:fb53594c26cce1bbd1cb3251e93d60a91ab611e86741a48a89f5a1d6d8dcf52d",
          "verified": true
        },
        {
          "id": "SRC-009",
          "kind": "repository_evidence",
          "summary": "只读审计确认四个正式底图、新候选底图和共享渲染链均依赖绿幕色键，问题需要 schema、renderer、目录和素材 revision 的统一迁移。",
          "locator": "docs/ASSET_PIPELINE_NO_GREENSCREEN_DECISION_2026-10-31.md",
          "content_digest": "sha256:fb53594c26cce1bbd1cb3251e93d60a91ab611e86741a48a89f5a1d6d8dcf52d",
          "verified": true
        },
        {
          "id": "SRC-010",
          "kind": "user_statement",
          "summary": "决定人纠正了将权利声明和内部验收任务当成新候选创作授权的工作流程错误，要求彻底修正合同、状态机和程序门禁。",
          "locator": "docs/ASSET_PIPELINE_WORKFLOW_CORRECTION_2026-10-31.md",
          "content_digest": "sha256:388709f840ac6e05475f111feb0291edbbd0e891ede5ce421878b37226ab26ce",
          "verified": true
        },
        {
          "id": "SRC-011",
          "kind": "user_statement",
          "summary": "决定人在真实 Figma 插件中提交六项回归证据，要求从全局结构纠正悬停抖动、裁切轴向、圆角边界、彩色角块、默认画面来源和 QA 漏洞。",
          "locator": "docs/PLUGIN_REGRESSION_CORRECTION_2026-10-31.md",
          "content_digest": "sha256:c4c538dc82d8ff91f35b095950df0ac7b0ee8502185774213bf34242c7148554",
          "verified": true
        }
      ],
      "product_baseline": {
        "problem_statement": {
          "text": "现有样机系统曾把创作授权、素材内容、渲染孔径、裁切几何和交互反馈分散在多套局部机制中：它不仅曾允许未经委托的候选进入测试库，还在已声称通过自动门禁后，于真实 Figma 宿主再现悬停抖动、单边拖拽变成双轴缩放、平行圆角边界、彩色角块泄漏和未经授权的默认界面，证明旧验收未覆盖真实交互不变量和最终像素来源。",
          "source_ids": [
            "SRC-001",
            "SRC-004",
            "SRC-005",
            "SRC-006",
            "SRC-010",
            "SRC-011"
          ]
        },
        "target_users": [
          {
            "id": "USR-001",
            "description": "只提供参考截图、权利声明和审核决定的产品/视觉决定人。",
            "source_ids": [
              "SRC-001"
            ]
          },
          {
            "id": "USR-002",
            "description": "在拥有项目文件和必要本地工具的会话中执行制作、导入、质检和提升的 AI/工程执行代理。",
            "source_ids": [
              "SRC-001"
            ]
          }
        ],
        "desired_outcomes": [
          {
            "id": "OUT-001",
            "statement": "决定人只承担单次创作委托、参考权利、视觉方向和正式入库决定，其他确定性步骤由代理和系统完成。",
            "success_signal": "任何新候选都能回溯到决定人对准确参考图发起的单次委托；没有委托时系统停在 WAITING_FOR_USER_INPUT。",
            "source_ids": [
              "SRC-001",
              "SRC-002",
              "SRC-010"
            ]
          },
          {
            "id": "OUT-002",
            "statement": "只有技术 QA 与准确版本的人类批准同时有效时，样机才能进入正式库。",
            "success_signal": "缺失、过期、摘要不匹配或针对其他 revision 的任一批准都会被提升脚本拒绝，正式库保持不变。",
            "source_ids": [
              "SRC-001",
              "SRC-002",
              "SRC-006"
            ]
          },
          {
            "id": "OUT-003",
            "statement": "新对话可仅依靠仓库内权威和状态继续工作，不依赖旧聊天记忆。",
            "success_signal": "无旧对话上下文的执行者能识别当前资产状态、阻塞原因和唯一下一动作。",
            "source_ids": [
              "SRC-001",
              "SRC-002"
            ]
          },
          {
            "id": "OUT-004",
            "statement": "所有活动样机从候选底图开始就是完整可展示的样机，制作与运行链路完全不使用绿幕或色键替换。",
            "success_signal": "testing 与 production 的每个当前底图、缩略图和质检结果均无绿幕占位；schema、renderer、插件构建和服务路径均不存在色键字段、代码或回退分支。",
            "source_ids": [
              "SRC-008",
              "SRC-009"
            ]
          },
          {
            "id": "OUT-005",
            "statement": "真实插件中的悬停、裁切、孔径遮罩和屏幕内容使用同一组可执行不变量，不再依赖局部视觉补丁。",
            "success_signal": "真实 Figma+EX 宿主中反复悬停无几何抖动；右边拖拽只改变水平轴、下边拖拽只改变垂直轴；默认屏幕没有未授权界面或彩色角块；缺失来源、摘要错配或色度超限均失败关闭。",
            "source_ids": [
              "SRC-011"
            ]
          }
        ],
        "decisions": [
          {
            "id": "PD-001",
            "statement": "先实现并验证本地完整流水线，再讨论 GitHub、Netlify、云后台或 Figma 社区发布。",
            "rationale": "避免把尚未稳定的流程搬到线上并扩大数据、权限和恢复风险。",
            "status": "confirmed",
            "source_ids": [
              "SRC-001"
            ]
          },
          {
            "id": "PD-002",
            "statement": "采用机器技术门禁与人类准确版本批准的双重入库机制，任何一方都不能替代另一方。",
            "rationale": "审美决定不能证明文件完整和技术正确，自动检查也不能替代人类产品决定。",
            "status": "confirmed",
            "source_ids": [
              "SRC-001"
            ]
          },
          {
            "id": "PD-003",
            "statement": "参考图必须由人类声明 owned、authorized 或 reference-only，系统不得自行推定权利。",
            "rationale": "AI和代码不能验证法律权利；没有声明时必须失败关闭。",
            "status": "confirmed",
            "source_ids": [
              "SRC-001"
            ]
          },
          {
            "id": "PD-004",
            "statement": "自动分类只能映射到受控 taxonomy；未知分类阻塞流转而不是自动创建同义分类。",
            "rationale": "保持插件筛选、搜索和长期资产治理一致。",
            "status": "confirmed",
            "source_ids": [
              "SRC-001"
            ]
          },
          {
            "id": "PD-005",
            "statement": "批准和提升绑定稳定 assetId、正整数 revision 和当前 itemSha256；任何内容变化使旧批准失效。",
            "rationale": "防止批准一个版本却发布另一个版本。",
            "status": "confirmed",
            "source_ids": [
              "SRC-001"
            ]
          },
          {
            "id": "PD-006",
            "statement": "用仓库内合同、政策、运行手册、工作状态和确定性命令完成新对话交接。",
            "rationale": "对话记忆不是可靠的工程状态或批准记录。",
            "status": "confirmed",
            "source_ids": [
              "SRC-001"
            ]
          },
          {
            "id": "PD-007",
            "statement": "所有活动样机绝对禁止绿幕和任何色键替换；统一采用完整样机底图、显式屏幕孔径几何/遮罩及可选前景与反射层，且不保留旧色键兼容路径。",
            "rationale": "完整样机必须在任何预览入口都可信，屏幕边界必须来自稳定的显式数据而不是容易产生色溢、接缝和错误缩略图的像素颜色。",
            "status": "confirmed",
            "source_ids": [
              "SRC-008",
              "SRC-009"
            ]
          },
          {
            "id": "PD-008",
            "statement": "参考图权利声明与候选创作委托必须分离；每个候选必须绑定一份单次、最多一个候选、精确参考摘要的人类委托，没有委托时必须停在 WAITING_FOR_USER_INPUT。",
            "rationale": "“可以使用这张图”不能推导出“现在要基于它再创建一个候选”；程序必须阻止内部验收任务越权生产真实素材。",
            "status": "confirmed",
            "source_ids": [
              "SRC-010"
            ]
          },
          {
            "id": "PD-009",
            "statement": "插件交互、裁切几何和屏幕内容来源必须以共享不变量统一治理；禁止用随机旋转、平行几何算法、固定外层圆角或未经参考绑定的默认界面制造视觉效果。",
            "rationale": "用户真实宿主证据证明旧局部验收没有覆盖命中几何、轴向约束、最终像素和内容来源，导致同类问题反复回归。",
            "status": "confirmed",
            "source_ids": [
              "SRC-011"
            ]
          }
        ],
        "non_goals": [
          {
            "id": "NG-001",
            "statement": "本阶段不内置第三方图片生成 API、不保存模型密钥，也不证明任意截图都能自动生成高质量样机。",
            "source_ids": [
              "SRC-001",
              "SRC-002"
            ]
          },
          {
            "id": "NG-002",
            "statement": "本阶段不执行 GitHub、Netlify、Figma 社区或其他公网发布。",
            "source_ids": [
              "SRC-001"
            ]
          },
          {
            "id": "NG-003",
            "statement": "本阶段不把四个 temporary-test 素材宣称为最终正式内容。",
            "source_ids": [
              "SRC-001",
              "SRC-004"
            ]
          }
        ],
        "constraints": [
          {
            "id": "CON-001",
            "statement": "保留当前工作区全部既有未提交修改，不重置、不覆盖无关成果。",
            "type": "immovable",
            "source_ids": [
              "SRC-001"
            ]
          },
          {
            "id": "CON-002",
            "statement": "自动化只能产生 PASS_CANDIDATE；最终验收和每个资产的正式入库必须由确定的人类决定。",
            "type": "immovable",
            "source_ids": [
              "SRC-001",
              "SRC-002"
            ]
          },
          {
            "id": "CON-003",
            "statement": "优先复用现有 catalog contract、质检台、批准报告、快照和提升机制，避免创建平行正式库。",
            "type": "immovable",
            "source_ids": [
              "SRC-002",
              "SRC-005",
              "SRC-006",
              "SRC-007"
            ]
          },
          {
            "id": "CON-004",
            "statement": "候选底图、测试库、正式库、缩略图、质检台、插件和导出链均不得把绿色或任何色键颜色作为待替换屏幕；旧绿幕 revision 不得继续作为活动素材或沿用任何批准。",
            "type": "immovable",
            "source_ids": [
              "SRC-008"
            ]
          },
          {
            "id": "CON-005",
            "statement": "内部测试、合同待办、旧截图或权利声明都不得代替当次单次人类创作委托；端到端工程验收应使用隔离 fixture 或等待真实委托。",
            "type": "immovable",
            "source_ids": [
              "SRC-010"
            ]
          },
          {
            "id": "CON-006",
            "statement": "卡片悬停不得改变命中几何；裁切单边只改变对应轴并固定对边；默认画面不得生成未经授权内容；QA 必须验证屏幕来源和最终像素泄漏。",
            "type": "immovable",
            "source_ids": [
              "SRC-011"
            ]
          }
        ],
        "open_questions": [
          {
            "id": "Q-001",
            "question": "参考图权利如何处理？",
            "critical": true,
            "status": "resolved",
            "resolution": "每个资产由人类在 owned、authorized、reference-only 中明确选择；未选择时阻塞，reference-only 不复用参考图字节。",
            "source_ids": [
              "SRC-001"
            ],
            "resolution_source_ids": [
              "SRC-001"
            ]
          },
          {
            "id": "Q-002",
            "question": "用于最终真实闭环的第一张样机参考截图是哪一张？",
            "critical": false,
            "status": "resolved",
            "resolution": "不再为内部验收寻找或复用截图；五个 r2 闭环已完成，未来新候选只能来自决定人的下一次明确委托。",
            "source_ids": [
              "SRC-001",
              "SRC-010"
            ],
            "resolution_source_ids": [
              "SRC-010"
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
          "id": "CHG-004",
          "contract_version": 4,
          "operation": "removed",
          "status": "reconciled",
          "reason": "决定人指出了根本工作流程错误：旧合同将内部闭环测试升级为必须生产的真实新候选，旧状态机又没有独立的单次人类创作委托。因此必须移除 TASK-010，并从合同、政策、状态机、程序和验收证据统一改为“无委托即停止”。",
          "source_ids": [
            "SRC-010"
          ],
          "impacted_ids": [
            "OUT-001",
            "PD-008",
            "CON-005",
            "Q-002",
            "HYP-001",
            "HYP-003",
            "HYP-005",
            "MET-001",
            "MET-002",
            "MET-005",
            "MET-009",
            "CAP-001",
            "CAP-007",
            "REQ-001",
            "REQ-002",
            "REQ-006",
            "REQ-011",
            "TP-001",
            "TP-003",
            "TP-005",
            "TP-006",
            "TASK-010",
            "TASK-011",
            "EVD-AP-010",
            "EVD-AP-011",
            "FND-AP-002"
          ],
          "superseded_ids": [
            "TASK-010"
          ],
          "author": {
            "type": "human",
            "identity": "Wang Zhentao",
            "role": "产品决定人、视觉审核人、正式入库决定人"
          },
          "changed_at": "2026-10-31T14:23:59+08:00",
          "approval_impact": "baseline_and_build"
        },
        {
          "id": "CHG-005",
          "contract_version": 5,
          "operation": "modified",
          "status": "reconciled",
          "reason": "决定人的真实 Figma 截图证明旧验收没有覆盖悬停命中几何、单边裁切轴向、画布圆角、屏幕内容来源和最终彩色角块；本次从共享不变量、素材 revision 和 QA 门禁统一纠正，旧 r2 批准不能授权 r3。",
          "source_ids": [
            "SRC-011"
          ],
          "impacted_ids": [
            "PD-009",
            "OUT-005",
            "CON-006",
            "CAP-008",
            "REQ-008",
            "REQ-009",
            "REQ-010",
            "REQ-012",
            "TP-002",
            "TP-005",
            "TP-007",
            "TASK-012",
            "FND-AP-005"
          ],
          "superseded_ids": [],
          "author": {
            "type": "human",
            "identity": "Wang Zhentao",
            "role": "产品决定人、视觉审核人、正式入库决定人"
          },
          "changed_at": "2026-10-31T17:10:00+08:00",
          "approval_impact": "baseline_and_build"
        }
      ]
    }

</details>
