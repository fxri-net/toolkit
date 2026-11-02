---
"@fxri/toolkit": patch
---

- 新增：`skills install --mode package` 纯包管理器模式，允许零选择且 core 不再强制
- 新增：`--no-skills` 仅本次零装，不改模式与已保存选择
- 优化：状态与安装报告输出当前模式，零选择时 `selection` 为空数组
