---
"@fxri/toolkit": minor
---

新增：CHANGELOG 支持追溯改写历史版本块

- `toolkit changelog version/format` 新增 `--history`：历史版本块内条目按其类型前缀与既有组标题归位、组标题转写为当前语言口径；无法识别的分组连同标题原样保留，不臆造归属（不加该选项时仍不动历史块）
- 条目类型前缀表补充 `技能：` / `skills：`（归入「优化改进」）与 `依赖：`（归入「依赖变更」），`### 补丁修复` 等历史组标题也能识别归位
- 修复 Windows 检出（`core.autocrlf`）下 `pnpm sync:changelog-doc` 因 CRLF 误判「未发现版本块」而中止
