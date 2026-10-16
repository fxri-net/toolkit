---
"@fxri/toolkit": minor
---

新增：规范载体升 v3——`.tasks/conventions/` 按读面拆「常驻索引 / 按需分册 / 归档」三分区，新增 `retired.md` 退休台账承载作废条目（冻结退休时语义并记录后继与条文去向），条目作废走三层清理（索引行迁出、分册小节物理删除、外部单一事实源同步收敛），从源头抑制常驻读面的规范膨胀
新增：`toolkit conventions upgrade` 支持 v1 / v2 → v3 链式升级——v2 升级自动删除索引表「状态」「确立来源任务」两列、把作废条目迁入 `retired.md` 并物理删除分册对应小节，`--dry-run` 可预演
新增：载体支持分类标签分册（如 `build.md` 等非端分册），归属取已存在的分册名即合法
修改：`toolkit conventions status` 新增校验——退休台账可定位性、退休 ID 与活跃 ID 重叠、common 归属却语义提及端名
修改：任务 `scope` 字段校验新增路径分隔符软告警（`/` 与 `\`）
优化：跨平台兼容补强——新增 macOS CI job、统一路径大小写归一口径（覆盖 macOS）、补 `.gitattributes` 统一换行符
修复：`toolkit conventions upgrade` 与 `status` 判定稳定 ID 时容忍行内代码包裹（`` `C-4` `` 不再误判为「首列仍为规则名」「不合稳定 ID 形态」）——对齐规范「引用一律行内代码包裹」的合法写法
修复：`toolkit conventions status` 的 common 下沉提示改为大小写不敏感、判据收窄为「语义含端限定语（仅 / 只 / 专属 / 适用于）且提及端名」，消除举例式提及的假阳性并补上大写端名的漏报
修改：`toolkit conventions upgrade` 新增 `index.md` 正文 v2 措辞复核——表外自由文本残留「确立来源任务」「状态改为已废弃」等表述时列入 `reviews`（只报不改）
修改：`toolkit tasks check` 与 `toolkit conventions status` 新增演进记录首列形态校验——v3 载体的 `history.md` 数据行首列须记为行内代码包裹的稳定 ID `C-<n>`，检出规则名等非 ID 首列时软告警（只报不改，历史行只追加故补齐须人工确认）
