---
"@fxri/toolkit": patch
---

- 新增：`toolkit rules` 提供规则组合与复制的便捷入口，组合结果仍按模块真源生成
- 新增：全局规则拆为 core / output / workflow / env / commit / usage 六个可组合模块，正文随包分发
- 修改：规则更新时间锚点改为模块级，页面与组合输出取所含模块最新时间
