---
"@fxri/toolkit": patch
---

- 新增：任务状态 `搁置`，用于「已建档但本阶段不投入」——不终结、不归档、可唤醒；`toolkit tasks --status 搁置` 可单独盘点
- 修改：`tasks stats` 的活跃滞留口径排除搁置，输出改为「活跃任务」并在末尾单列「另有搁置 N 个」（`active.count` / `avgStay` / `maxStay` 字段名未变、含义变更，新增 `active.held`）
- 修改：任务总览分组顺序在阻塞与已完成之间插入搁置
- 修改：多人共用同一任务区时需同步升级——旧版 CLI 读到 `status: 搁置` 会报「status 非法值」
