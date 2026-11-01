# 样机生产流水线运行手册

本手册服务本地资产流水线，不自行授权外部发布。外部发布权限只以 `quality/remote-catalog-contract.json` 与其来源文件为准：当前公开 GitHub 与 Figma Community 提交已授权；精确 Netlify 站点继续可用，但任何第二次 Netlify 部署仍未授权。

## 新对话恢复

```bash
pnpm asset:contract:check
pnpm asset:status
```

任何命令失败时先修复失败原因。不得根据旧聊天猜测状态或批准。

## 等待用户委托

没有新截图和当次明确的“请制作一个候选”时，正确状态是 `WAITING_FOR_USER_INPUT`。不得因为内部测试、合同待办、旧截图存在或旧权利声明而自行生成候选。

## 记录单次创作委托

当决定人对当次截图明确要求制作候选时，先记录一次不可变委托。同时声明参考图属于：

- `owned`：决定人拥有；
- `authorized`：决定人确认有明确授权；
- `reference-only`：只作构图/风格参考，候选必须重新创作且字节不能相同。

权利声明不是创作委托。只有两者都存在才可继续：

```bash
pnpm asset:authorize-request -- \
  --reference /absolute/reference.png \
  --id rock-phone-front \
  --name "岩石手机 · 正面" \
  --category phone \
  --rights reference-only \
  --request-text "请根据这张截图制作一个样机候选" \
  --actor "Wang Zhentao" \
  --confirmed-by-human
```

执行代理禁止根据自己的测试目标或推断添加 `--confirmed-by-human`。若参考图已经用于另一个资产，只有决定人当次明确授权复用时才可加 `--allow-reference-reuse`。命令会返回单次 `requestId`。

## 从已授权委托创建候选

执行代理准备高分辨率候选基础图后运行：

```bash
pnpm asset:import -- \
  --request-id <requestId> \
  --base /absolute/candidate.png \
  --tags "phone,rock,front" \
  --screen-quad '[[100,100],[900,100],[900,1700],[100,1700]]' \
  --corner-radii '[0.08,0.08,0.08,0.08]' \
  --recommended '1170x2532:手机竖屏'
```

系统从委托中读取绑定的 ID、名称、分类、参考摘要和权利模式，自动确定 revision、图片尺寸、缩略图、不可变路径和 SHA-256。成功后该委托立即变为 `CONSUMED`，不能继续生成第二个候选。缺失委托、委托摘要漂移、重复消耗、参考图重用未授权、未知分类、损坏图片、非法几何或不可变路径冲突都会在写入前失败。

候选基础图本身必须是完整样机。导入成功后系统直接进入 `TESTING`；不得等待单独的视觉批准、基线指纹或构建指纹。

## 技术质检

1. 运行 `pnpm catalog`。
2. 打开 `http://127.0.0.1:4173/lab`。
3. 完成十项自动检查、网格/横屏/竖屏/明暗边界四种测试图和五项人工检查。
4. 保存几何后重新确认所有门禁。
5. 点击“记录技术 QA 通过”。该动作只生成最终审阅候选，不会改变正式库。

任何素材、分类、屏幕几何或渲染元数据变化都会使旧 QA 与 release approval 失效。

## 一次最终审阅与入库决定

所有待审样机技术 QA 通过、插件完成构建和真实 Figma 宿主回归后，执行代理生成一个最终审阅包：

```bash
pnpm asset:prepare-final-review -- --all
```

审阅包必须显示最终视觉、真实宿主结果、已知限制和一个批次指纹。决定人只需对整个批次回答一次“通过并进入本地正式库”或“不通过”。获得明确通过后，执行代理才运行：

```bash
pnpm asset:approve-final -- \
  --expected-batch-fingerprint <batchFingerprint> \
  --actor "Wang Zhentao" \
  --confirmed-by-human
```

禁止代理伪造 `--confirmed-by-human`。命令只记录一次批次决定，系统内部自动绑定批次中每个样机和 QA 摘要。

## 本地正式库提升

```bash
pnpm catalog:promote -- --all
pnpm catalog:check
pnpm asset:status
```

提升脚本必须验证技术 QA 和人类 release approval，先保存正式库快照，复制并复核不可变文件，最后原子更新 manifest。`PROMOTED` 只表示本地正式库完成，不表示已经部署。

## 失败恢复

- `WAITING_FOR_USER_INPUT`：没有待执行委托；停止生产，等待新截图和明确创作请求。
- `REQUEST_AUTHORIZED`：只能为已绑定的截图制作最多一个候选。
- `CANDIDATE_READY`：候选已完整写入；系统应立即转入 `TESTING`，不等待人类批准。
- `TESTING`：进入质检台；几何变化后重新质检。
- `QA_PASSED`：可纳入一个最终审阅批次。
- `FINAL_APPROVED`：决定人已对准确批次做出一次“通过并入库”决定。
- `PROMOTED`：本地资产闭环完成；是否部署及部署状态由独立远程目录合同决定。
- `BLOCKED`：先处理 `issues`，不得继续流转。
- `NEEDS_REVISION` / `QA_FAILED`：制作新 revision，不覆盖旧不可变文件。

如果状态与真实文件不一致，`pnpm asset:status` 必须报告 `BLOCKED`。修复真实文件或状态来源后重新运行，不得手改通过结论。
