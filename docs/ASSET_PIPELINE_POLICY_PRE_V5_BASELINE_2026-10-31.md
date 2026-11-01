# 样机流水线 v5 实施前政策基线

冻结时间：2026-10-31T12:54:30+08:00

来源文件：`quality/asset-pipeline-policy.json`

冻结目的：记录零绿幕迁移前的真实机器政策，避免把实施过程中必须修改的活动政策文件同时当成不可变审批来源。

## 已验证字段

- policyId：`MOCKUP-ASSET-PIPELINE-1`
- catalogSchemaVersion：`4`
- rendererVersion：`2.3.0`
- requiredAutomaticChecks：`schema, renderer, dimensions, recommendedSize, geometry, aperture, seam, provenance, integrity`
- seam.minimumInteriorSpillRatio：`0.85`
- seam.maximumTruncatedSamples：`0`
- seam.maximumTruncatedEdgeRatio：`0`
- AP-G05 明确要求九项自动检查与接缝像素门禁。

## 与零绿幕决定的冲突

旧政策把 `seam`、green spill ratio 和 edge extension 作为正式门禁，依赖 catalog schema v4 与 renderer 2.3.0 的色键机制。它只能作为“为什么必须迁移”的历史证据，不能继续作为 v5 活动政策。

活动政策在 v5 实施中必须改为：完整底图、显式孔径遮罩、零色键 schema、典型占位板拒绝、活动引用残留检查和准确版本人类复审。
