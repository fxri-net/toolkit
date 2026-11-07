---
"@fxri/toolkit": minor
---

- 新增：`toolkit rules` 命令族，支持列出、组合、复制全局规则模块并记住选择顺序
- 新增：全局规则拆为 core / output / workflow / env / commit / usage 六个可组合模块，正文随包分发
- 修改：规则更新时间锚点改为模块级，页面与组合输出取所含模块最新时间
