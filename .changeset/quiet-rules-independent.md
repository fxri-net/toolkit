---
"@fxri/toolkit": patch
---

- 优化：全局规则模块改为语义自述，消除跨模块悬空指代
- 优化：`workflow` 模块把「个人偏好可覆写」改为「除非规则另有约定」，按 `recommended` 预设复制时不再指向未包含的 `personal` 模块
- 清理：`workflow` 模块移除「技能上报」转发条，上报要求由 `usage` 模块独立承载
- 优化：`usage` 与 `personal` 模块去掉对其它模块条目的具名引用，单独复制即可读通
- 文档：`rule compose` 组合结果与文档站规则页同步更新锚点
