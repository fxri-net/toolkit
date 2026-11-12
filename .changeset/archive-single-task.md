---
"@fxri/toolkit": patch
---

- 新增：`toolkit tasks archive --task <唯一键>` 只归档指定任务，键不存在或未终结时报错退出
- 优化：一次归档多个任务时在 stderr 提示建议逐个归档，以匹配逐任务提交（不阻断）
