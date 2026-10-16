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
修改：规范载体三表表头统一为稳定 ID `ID`——索引表（`| ID | 规则 | 当前语义 | 归属 | 单一事实源 |`）、`history.md`（`| ID | 修订内容 | 修订来源任务 |`）、`retired.md` 首格同归一；表头与分隔行由列名常量单源派生，杜绝列集合形态漂移
修复：`toolkit init` 生成的 `conventions/index.md` 骨架此前残留 v2 列结构，改为按 v3 五列生成
修改：`toolkit conventions upgrade` 的 v2→v3 升级新增 `history.md` 表头首格归一为稳定 ID `ID`
修改：`toolkit tasks check` 与 `toolkit conventions status` 新增表形态速检——v3 载体索引表残留 v2 独有列（「状态」「确立来源任务」）或 `history.md` / `retired.md` 表头首格非 `ID` 时软告警（只报不改）
修改：表形态校验从「速检」升级为完整比对——v3 索引表列集合须恰为 `ID | 规则 | 当前语义 | 归属 | 单一事实源` 五列（列名与次序逐格一致，多列 / 少列 / 换序均检出）、`history.md` / `retired.md` 表头整行逐格比对、载体各文件（`index.md`、分册、`history.md`、`retired.md`）表头行与紧随分隔行列数须相等（跳过 fenced code block）；检出统一为软告警（只报不改，须人工确认后按规范归一）
文档：`conventions-spec` 补齐形态与迁移措辞——索引表五列固定、`history.md` / `retired.md` 表头固定逐格一致、表列数自洽、入口壳版本沿革（壳标记独立演进、当前 `v2`、从未有过 `v1` 壳）、不得显式书写 `v1` 标记、手工迁 v2 与 `toolkit conventions upgrade` 链式直达 v3 的落点差异
