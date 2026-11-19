---
"@fxri/toolkit": patch
---

- 修改：`fxri-text-encoding` 补「先分诊」判定——解析 / 语法类报错不属本技能，先按宿主 shell / 语言的语法与版本排查；症状须为字符形态异常才进入乱码三问
- 修改：description 的不适用范围补「宿主 shell / 语言的语法差异排查（其编码通道仍适用）」；触发判据第 1 条拆「参数通道 / 文件通道」、第 4 条补症状反例
- 修改：`references/troubleshooting.md` 头部注明只处理字符形态类异常
