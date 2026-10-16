---
"@fxri/toolkit": minor
---

新增：规范载体升 v3——`.tasks/conventions/` 按读面拆「常驻索引 / 按需分册 / 归档」三分区，新增 `retired.md` 退休台账承载作废条目（冻结退休时语义并记录后继与条文去向），条目作废走三层清理（索引行迁出、分册小节物理删除、外部单一事实源同步收敛），从源头抑制常驻读面的规范膨胀
新增：`toolkit conventions upgrade` 支持 v1 / v2 → v3 链式升级——v2 升级自动删除索引表「状态」「确立来源任务」两列、把作废条目迁入 `retired.md` 并物理删除分册对应小节，`--dry-run` 可预演
新增：载体支持分类标签分册（如 `build.md` 等非端分册），归属取已存在的分册名即合法
修改：`toolkit conventions status` 新增校验——退休台账可定位性、退休 ID 与活跃 ID 重叠、common 归属却语义提及端名
修改：任务 `scope` 字段校验新增路径分隔符软告警（`/` 与 `\`）
优化：跨平台兼容补强——新增 macOS CI job、统一路径大小写归一口径（覆盖 macOS）、补 `.gitattributes` 统一换行符
