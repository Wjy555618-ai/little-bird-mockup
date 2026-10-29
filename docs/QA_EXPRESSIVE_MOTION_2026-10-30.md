# 受控交互动效 QA（2026-10-30）

## 本轮目标

- 样机卡片每次鼠标移入时随机向左或向右扭转几度，但同一次悬停期间不重算、不抖动、不增加悬停描边。
- “全部 / 相似”使用同一个状态底板滑动切换。
- 分类从原生 `select` 替换为可控的自定义 `listbox`，带弹出、收起和箭头旋转过渡。
- 样机加载期间对旧预览实施 12px CSS Gaussian blur，保留内容轮廓，完成后清晰落定。

## 功能与动效验证

| 项目 | 验证方式 | 结果 |
| --- | --- | --- |
| 卡片随机方向 | 对同一非选中卡片执行 12 次“移入—停留—移出” | 同时出现左右方向，角度范围 -2.67° 至 +2.61° |
| 悬停稳定 | 每次落定后分两次读取变换角度 | 最大停留漂移 0° |
| 卡片内部鼠标移动 | 鼠标横向穿过卡片的 9 个采样点 | CSS 角度变量全程保持同一值 |
| 悬停描边 | 比较移入前后非选中卡片 `border-color` | 前后均为透明 |
| 全部 / 相似 | 真实点击后在 70ms 和 310ms 取样 | 状态底板从 0px 经 108.81px 移至 129.5px，并能返回全部 |
| 分类弹层 | 真实点击，70ms 取样，选择“手机”，再用键盘恢复“全部分类” | 中段透明度 0.47，过渡后 1；标签、筛选结果、ARIA 状态同步 |
| 加载高斯模糊 | 对目标样机资产注入 800ms 网络延迟后真实点击 | 加载中读取到 `blur(11.72px)`，完成后回到 `blur(0px)` |
| 减少动效 | `prefers-reduced-motion: reduce` 的 900×700 环境 | 分段、弹层过渡均为 0s，功能仍可用 |
| 小窗口布局 | 900×700 整体截图与区域边界检查 | 无页面横向或纵向滚动，左侧库、预览区和底部操作区均完整可见 |

## 探索性回归

- 循环切换“样机 / 画面调整 / 透视编辑”，左侧面板和标题正确同步。
- 缩放到 110% 再恢复适应，预览控件正常。
- 搜索“手机”得到 2 个结果，清空后恢复 4 个结果。
- Figma+EX 宿主中关闭并重载插件，真实点击“相似”得到 1 个结果；打开自定义分类弹层、选择“手机”得到 2 个结果，最后已恢复“全部 + 全部分类”。

## 视觉证据

- `docs/evidence/expressive-motion-2026-10-30/card-hover.png`
- `docs/evidence/expressive-motion-2026-10-30/segment-transition.png`
- `docs/evidence/expressive-motion-2026-10-30/category-menu-transition.png`
- `docs/evidence/expressive-motion-2026-10-30/loading-blur.png`
- `docs/evidence/expressive-motion-2026-10-30/min-viewport.png`

## 自动检查

- `build-plugin --check`
- JavaScript 语法检查：通过
- testing / production catalog 检查：通过
- Node test：28 个全部通过
