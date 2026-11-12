---
"@fxri/toolkit": patch
---

- 优化：`skills` 安装与卸载按面拆分为 common / global / project / autolink 四个模块，`install.ts` 改为统一出口
- 优化：全局面与项目面流程仍各自独立，未合并任何判定或文案，行为基线快照零差异
