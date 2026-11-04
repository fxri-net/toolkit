---
"@fxri/toolkit": patch
---

- 修复：`skills sources` 不再列出内置源 `toolkit`，与「外部来源」定位及 `sources notify` 的内置源拒绝口径一致
- 修复：`skills sources refresh --dry-run` 显示来源当前版本，未知版本标为「未知」/ `null`
- 修复：`sources refresh` 的 JSON 在来源无版本时返回 `null`，不再输出空串
- 修复：`skills sources` 与 `sources refresh` 的帮助文案如实反映「刷新 / 提示频率管理」与「dry-run 显示当前版本」
