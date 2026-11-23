---
"@fxri/toolkit": patch
---

- 修复：策略声明该目录不安装（`delivery: off`）时 guard 仍输出正文，现按未激活结束（stdout 为空、退出码 3）
- 优化：分发形态按「任一目录入口壳或不安装 → 全局入口壳」汇总，全全文技能不产生 guard 调用
