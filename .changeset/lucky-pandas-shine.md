---
"@fxri/toolkit": patch
---

- 修复：修复 `toolkit conventions status` 在 @fxri/toolkit 源仓库内误提示「未找到入口壳：执行 toolkit init 可生成」的问题：源仓库本就不生成入口壳（靠 fxri-* 技能自举），现不再给出补生成建议
