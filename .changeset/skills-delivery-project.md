---
"@fxri/toolkit": patch
---

- 修改：项目面 `--gate` / `--embed` 由忽略改为实际生效，入口壳读取项目真源副本（2.0.0 前保留一条兼容提示）
- 新增：项目面按 `skillsDelivery` 落入口壳，`off` 不落产物并由 `--prune` 清理残留
- 优化：项目面 `status` 识别入口壳形态与漂移，`scope guard` 优先读取仓库内真源副本
