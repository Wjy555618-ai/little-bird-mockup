# Spec-to-Demo review packet

- Handoff: `S2D-836f9e36f083`
- Schema: `3.0.0`
- Contract version: `3`
- Implementation revision: `—`
- Stage: `awaiting_baseline_approval`
- Baseline fingerprint: `sha256:be3d740e9e77beb3de46abeb0b98afd7bdc638574fd88c468cada6f534e5d851`
- Build fingerprint: `sha256:1095a10c2b81c0d7d979c5f5dc6c087e06b463a07c8593061812b29beb0a9a9a`
- Acceptance fingerprint: `sha256:eabe79bcf223d1e9a3500f4c3f98391ca8397ba37ecdfaaf0eef60c89e5864ee`

> Fingerprints prove review binding only. They do not prove implementation quality, product value, or final acceptance.

## Product baseline

**Problem:** 现有项目已具备质检、技术批准和正式库提升的后半段，但新样机仍需人工放文件和编辑清单，缺少参考权利、候选导入、自动身份/分类、独立人类正式批准、持久工作状态和新对话恢复，因此决定人还无法只提供截图并承担审核。

### Sources

- **SRC-001** `user_statement` — 决定人批准截图输入、AI执行、双重门禁、本地优先和仓库交接的样机生产方案。; locator `docs/ASSET_PIPELINE_AUTHORITY_2026-10-31.md`; digest `sha256:03593fdd588d053d2d1e8c608c713c00f77728b5fc2d188048f44650bcf67d75`
- **SRC-002** `repository_evidence` — 当前人类可读资产流水线合同。; locator `docs/ASSET_PIPELINE_DEVELOPMENT_CONTRACT.md`; digest `sha256:c6352bafd8c6cf6d469862f82b0c1ed0cab96999d2b7d89f6cc0565d4cc99f74`
- **SRC-004** `repository_evidence` — 实施前 README 证明当前流程从手工放置测试素材开始，四个素材均为临时测试内容。; locator `docs/ASSET_PIPELINE_REPOSITORY_BASELINE_2026-10-31.md`; digest `sha256:b06539b388693106743cceef156fc99530788c47201559c269c99863bf104a00`
- **SRC-005** `repository_evidence` — 实施前质检服务只有几何保存和 QA 批准写入接口，没有新增样机入口。; locator `docs/ASSET_PIPELINE_REPOSITORY_BASELINE_2026-10-31.md`; digest `sha256:b06539b388693106743cceef156fc99530788c47201559c269c99863bf104a00`
- **SRC-006** `repository_evidence` — 实施前提升脚本校验技术 QA 摘要并复制到正式库，但没有独立人类 release approval。; locator `docs/ASSET_PIPELINE_REPOSITORY_BASELINE_2026-10-31.md`; digest `sha256:b06539b388693106743cceef156fc99530788c47201559c269c99863bf104a00`
- **SRC-007** `repository_evidence` — 实施前目录合同强制分类、revision、项目自制来源、摘要和正式 QA 元数据。; locator `docs/ASSET_PIPELINE_REPOSITORY_BASELINE_2026-10-31.md`; digest `sha256:b06539b388693106743cceef156fc99530788c47201559c269c99863bf104a00`
- **SRC-008** `user_statement` — 决定人明确要求所有样机绝对禁止绿幕效果，候选、底图、缩略图和最终结果都必须是完整样机。; locator `docs/ASSET_PIPELINE_NO_GREENSCREEN_DECISION_2026-10-31.md`; digest `sha256:fb53594c26cce1bbd1cb3251e93d60a91ab611e86741a48a89f5a1d6d8dcf52d`
- **SRC-009** `repository_evidence` — 只读审计确认四个正式底图、新候选底图和共享渲染链均依赖绿幕色键，问题需要 schema、renderer、目录和素材 revision 的统一迁移。; locator `docs/ASSET_PIPELINE_NO_GREENSCREEN_DECISION_2026-10-31.md`; digest `sha256:fb53594c26cce1bbd1cb3251e93d60a91ab611e86741a48a89f5a1d6d8dcf52d`

### Target users

- **USR-001** — 只提供参考截图、权利声明和审核决定的产品/视觉决定人。
- **USR-002** — 在拥有项目文件和必要本地工具的会话中执行制作、导入、质检和提升的 AI/工程执行代理。

### Desired outcomes

- **OUT-001** — 决定人只承担参考权利、视觉方向和正式入库决定，其他确定性步骤由代理和系统完成。; success: 一个全新真实样机闭环中，决定人除三类明确决定外不需要手工编辑文件、清单、分类或摘要。
- **OUT-002** — 只有技术 QA 与准确版本的人类批准同时有效时，样机才能进入正式库。; success: 缺失、过期、摘要不匹配或针对其他 revision 的任一批准都会被提升脚本拒绝，正式库保持不变。
- **OUT-003** — 新对话可仅依靠仓库内权威和状态继续工作，不依赖旧聊天记忆。; success: 无旧对话上下文的执行者能识别当前资产状态、阻塞原因和唯一下一动作。
- **OUT-004** — 所有活动样机从候选底图开始就是完整可展示的样机，制作与运行链路完全不使用绿幕或色键替换。; success: testing 与 production 的每个当前底图、缩略图和质检结果均无绿幕占位；schema、renderer、插件构建和服务路径均不存在色键字段、代码或回退分支。

### Decisions

- **PD-001** `confirmed` — 先实现并验证本地完整流水线，再讨论 GitHub、Netlify、云后台或 Figma 社区发布。; rationale: 避免把尚未稳定的流程搬到线上并扩大数据、权限和恢复风险。
- **PD-002** `confirmed` — 采用机器技术门禁与人类准确版本批准的双重入库机制，任何一方都不能替代另一方。; rationale: 审美决定不能证明文件完整和技术正确，自动检查也不能替代人类产品决定。
- **PD-003** `confirmed` — 参考图必须由人类声明 owned、authorized 或 reference-only，系统不得自行推定权利。; rationale: AI和代码不能验证法律权利；没有声明时必须失败关闭。
- **PD-004** `confirmed` — 自动分类只能映射到受控 taxonomy；未知分类阻塞流转而不是自动创建同义分类。; rationale: 保持插件筛选、搜索和长期资产治理一致。
- **PD-005** `confirmed` — 批准和提升绑定稳定 assetId、正整数 revision 和当前 itemSha256；任何内容变化使旧批准失效。; rationale: 防止批准一个版本却发布另一个版本。
- **PD-006** `confirmed` — 用仓库内合同、政策、运行手册、工作状态和确定性命令完成新对话交接。; rationale: 对话记忆不是可靠的工程状态或批准记录。
- **PD-007** `confirmed` — 所有活动样机绝对禁止绿幕和任何色键替换；统一采用完整样机底图、显式屏幕孔径几何/遮罩及可选前景与反射层，且不保留旧色键兼容路径。; rationale: 完整样机必须在任何预览入口都可信，屏幕边界必须来自稳定的显式数据而不是容易产生色溢、接缝和错误缩略图的像素颜色。

### Non-goals

- **NG-001** — 本阶段不内置第三方图片生成 API、不保存模型密钥，也不证明任意截图都能自动生成高质量样机。
- **NG-002** — 本阶段不执行 GitHub、Netlify、Figma 社区或其他公网发布。
- **NG-003** — 本阶段不把四个 temporary-test 素材宣称为最终正式内容。

### Constraints

- **CON-001** `immovable` — 保留当前工作区全部既有未提交修改，不重置、不覆盖无关成果。
- **CON-002** `immovable` — 自动化只能产生 PASS_CANDIDATE；最终验收和每个资产的正式入库必须由确定的人类决定。
- **CON-003** `immovable` — 优先复用现有 catalog contract、质检台、批准报告、快照和提升机制，避免创建平行正式库。
- **CON-004** `immovable` — 候选底图、测试库、正式库、缩略图、质检台、插件和导出链均不得把绿色或任何色键颜色作为待替换屏幕；旧绿幕 revision 不得继续作为活动素材或沿用任何批准。

### Open questions

- **Q-001** `resolved` critical=`True` — 参考图权利如何处理？; resolution: 每个资产由人类在 owned、authorized、reference-only 中明确选择；未选择时阻塞，reference-only 不复用参考图字节。
- **Q-002** `open` critical=`False` — 用于最终真实闭环的第一张样机参考截图是哪一张？; resolution: —

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
          "content_digest": "sha256:c6352bafd8c6cf6d469862f82b0c1ed0cab96999d2b7d89f6cc0565d4cc99f74",
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
        }
      ],
      "product_baseline": {
        "problem_statement": {
          "text": "现有项目已具备质检、技术批准和正式库提升的后半段，但新样机仍需人工放文件和编辑清单，缺少参考权利、候选导入、自动身份/分类、独立人类正式批准、持久工作状态和新对话恢复，因此决定人还无法只提供截图并承担审核。",
          "source_ids": [
            "SRC-001",
            "SRC-004",
            "SRC-005",
            "SRC-006"
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
            "statement": "决定人只承担参考权利、视觉方向和正式入库决定，其他确定性步骤由代理和系统完成。",
            "success_signal": "一个全新真实样机闭环中，决定人除三类明确决定外不需要手工编辑文件、清单、分类或摘要。",
            "source_ids": [
              "SRC-001",
              "SRC-002"
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
            "status": "open",
            "source_ids": [
              "SRC-001"
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
        }
      ]
    }

</details>
