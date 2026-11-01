# 样机流水线“零绿幕”产品决定

决定日期：2026-10-31（Asia/Shanghai）

决定人：Wang Zhentao

决定原文：

> 所有所有的样机，绝对100%禁止使用绿幕效果！！！必须是100%的完全的样机！

随决定提供的界面截图 SHA-256：

`sha256:9c63e21eebfecfc86beca36b34615ab15f0c40d827ecf40f8576c99485ed801e`

## 1. 权威解释

“零绿幕”是对制作和渲染机制的绝对禁令，不是仅对最终导出画面的外观要求：

1. 候选底图、测试库底图、正式库底图、缩略图、插件列表、质检台和最终导出均不得把绿色或其他色键板当作待替换区域。
2. manifest、schema、运行时和质检规则不得包含 `chromaKey`、`chroma-edge` 或任何按颜色识别屏幕开口的兼容路径。
3. 每个进入候选审核的底图和缩略图本身必须是可直接展示的完整样机，屏幕内已有完整的非占位视觉内容；不能依赖插件把绿幕藏起来后才显得完整。
4. 用户画面只能依据明确的屏幕几何、孔径遮罩和可选前景/反射图层进行透视映射；像素颜色不得决定屏幕边界。
5. 已存在的绿幕 revision 不得继续作为测试库或正式库当前项。它们的旧批准只能保留为审计历史，不能证明新 revision 合格，也不能继续被插件或质检台提供。
6. 自然设计内容可以包含绿色；禁止的是“用绿色作为替换标记”的技术和视觉效果。机器门禁必须结合 schema 禁令、屏幕区域占位特征检测和人类完整样机检查，不能把“没有检测到某个 RGB 值”冒充完整性证明。

## 2. 当前仓库的已验证事实

2026-10-31 的只读检查确认：

- `catalog/production/v1/assets/studio-display-front-r1.png` 的屏幕是绿幕板；
- `catalog/production/v1/assets/rock-phone-front-r1.png` 的屏幕是绿幕板；
- `catalog/production/v1/assets/rail-phone-angle-r1.png` 的屏幕是绿幕板；
- `catalog/production/v1/assets/graphite-laptop-angle-r1.png` 的屏幕是绿幕板；
- `catalog/testing/v1/assets/workstation-display-three-quarter-r1.png` 的屏幕是绿幕板；
- `shared/mockup-renderer.js` 2.3.0 强制 `static-screen-v4`、`chroma-edge` 和 `chromaKey.enabled`，并通过像素色键测量接缝覆盖；
- testing/production manifest、质检服务、提升脚本、测试和架构文档均绑定同一色键机制。

因此，当前 4 个正式库素材和 `workstation-display-three-quarter r1` 都不满足本决定。此前对 r1 的视觉批准不再授权继续技术 QA。

## 3. 必须采用的单一替代架构

新架构采用“完整样机底图 + 显式孔径几何/遮罩 + 可选前景与反射层”：

1. 底图先以完整样机形式绘制；
2. 用户画面只投影并裁剪到显式屏幕孔径；
3. 遮挡物由显式前景层或遮挡几何恢复；
4. 反射由独立反射层叠加；
5. 不读取底图颜色来推断孔径，不保留 v4 色键回退路径。

## 4. 验收边界

只有以下全部成立，才可以声称“零绿幕迁移完成”：

1. 当前 testing 与 production manifest 中所有项均使用新 renderer/schema，且不存在色键字段或色键模式；
2. 当前 testing 与 production 所引用的每个底图、缩略图及质检图均是完整样机，没有绿幕/色键占位效果；
3. 旧绿幕 revision 已从所有活动清单和服务路径撤下，旧批准被标记为历史且不能流转；
4. 共享渲染器及插件构建产物不存在色键代码或兼容分支；
5. 自动门禁能拒绝色键 schema、典型绿幕占位素材和摘要/版本漂移；
6. 每个迁移后的样机通过网格、横屏、竖屏、边界、裁切、自由透视、300% 接缝和导出检查；
7. 人类对每个准确 revision 的完整底图/缩略图和四种测试图作出明确视觉结论；
8. 一个全新非绿幕候选完成从参考记录到正式库提升的真实闭环。
