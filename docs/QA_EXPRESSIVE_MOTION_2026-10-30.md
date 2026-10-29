# 受控交互动效 QA（2026-10-30）

## 本轮目标

- 样机卡片每次鼠标移入时随机向左或向右扭转几度，但同一次悬停期间不重算、不抖动、不增加悬停描边。
- “全部 / 相似”使用同一个状态底板滑动切换。
- 分类从原生 `select` 替换为可控的自定义 `listbox`，带弹出、收起和箭头旋转过渡。
- 每次切换样机时立即对预览实施 24px CSS Gaussian blur，最少保持 480ms，即使本地缓存秒开也必须清晰可见；随后用 280ms 缓动恢复清晰。

## 功能与动效验证

| 项目 | 验证方式 | 结果 |
| --- | --- | --- |
| 卡片随机方向 | 对同一非选中卡片执行 12 次“移入—停留—移出” | 同时出现左右方向，角度范围 -2.67° 至 +2.61° |
| 悬停稳定 | 每次落定后分两次读取变换角度 | 最大停留漂移 0° |
| 卡片内部鼠标移动 | 鼠标横向穿过卡片的 9 个采样点 | CSS 角度变量全程保持同一值 |
| 悬停描边 | 比较移入前后非选中卡片 `border-color` | 前后均为透明 |
| 全部 / 相似 | 真实点击后在 70ms 和 310ms 取样 | 状态底板从 0px 经 108.81px 移至 129.5px，并能返回全部 |
| 分类弹层 | 真实点击，70ms 取样，选择“手机”，再用键盘恢复“全部分类” | 中段透明度 0.47，过渡后 1；标签、筛选结果、ARIA 状态同步 |
| 缓存秒开高斯模糊 | 资产已缓存后真实点击其他样机，立即取样 | 读取到 `blur(24px)`、`opacity: 0.7`、`scale(1.055)`和 `transition: none`，模糊入场不再被加载速度跳过 |
| 模糊保持与退场 | 连续取样切换状态 | 强模糊保持窗口为 480ms；解除后中间帧读取到 `blur(6.22px)`，最终回到 `blur(0px)` |
| 连续快速切换 | 70ms 间隔连续点击两个样机 | 旧请求不会清理新请求的状态，最终样机正确，模糊恢复为 `blur(0px)` |
| 减少动效 | `prefers-reduced-motion: reduce` 的 900×700 环境 | 分段、弹层过渡均为 0s，功能仍可用 |
| 小窗口布局 | 900×700 整体截图与区域边界检查 | 无页面横向或纵向滚动，左侧库、预览区和底部操作区均完整可见 |

## 探索性回归

- 循环切换“样机 / 画面调整 / 透视编辑”，左侧面板和标题正确同步。
- 缩放到 110% 再恢复适应，预览控件正常。
- 搜索“手机”得到 2 个结果，清空后恢复 4 个结果。
- Figma+EX 宿主中关闭并重载最终构建，真实指针切换至“石墨笔记本”和“岩石手机”，切换期间预览只保留强模糊轮廓且“正在渲染”可见，完成后回到清晰可用状态。

## 视觉证据

- `docs/evidence/expressive-motion-2026-10-30/card-hover.png`
- `docs/evidence/expressive-motion-2026-10-30/segment-transition.png`
- `docs/evidence/expressive-motion-2026-10-30/category-menu-transition.png`
- `docs/evidence/expressive-motion-2026-10-30/loading-blur.png`
- `docs/evidence/expressive-motion-2026-10-30/loading-blur-figma-host.png`
- `docs/evidence/expressive-motion-2026-10-30/min-viewport.png`

## 自动检查

- `build-plugin --check`
- JavaScript 语法检查：通过
- testing / production catalog 检查：通过
- Node test：28 个全部通过
