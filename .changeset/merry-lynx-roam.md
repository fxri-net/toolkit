---
"@fxri/toolkit": minor
---

- 新增：`toolkit tasks stats` 支持 `--view` / `--status` 过滤（与 `tasks list` 口径一致，`--view` 默认 `all` 含归档），并补齐 `--date` 与 `--since` / `--until` 的互斥校验
- 新增：`toolkit tasks check` 补「`updated` 早于 `created`」与「归档块完成日期与所属月份目录不符」两项校验，并对 BOM、行尾空白、同文件 CRLF/LF 混用给出软告警（只报不改，修复走 `tasks normalize`）
- 优化：`toolkit changelog format` 由全量重建改为只重组识别到的语义分区——未识别分组标题连同条目原样保留、不臆造归属，不再丢内容；`--history format` 恢复幂等（不再逐次注入空行）
- 优化：`toolkit changelog format` 归类前后做条目数自检，减少即 stderr 告警提示人工核对（归类只应搬移、不应减少）
- 优化：升级检查前置到提前返回之前，所有子命令路径一致触发，不再有路径漏检
- 修复：`toolkit tasks export --redact` 改为全部文本列统一脱敏，消除 `任务名` 之外的漏网列
- 修复：`toolkit tasks normalize` 对无法识别完成时间的归档不再落「垃圾路径」，改为告警并跳过该项；`check` / `normalize` 分工在 help 中互相指引（check 只报不修、normalize 负责修）
- 修复：`toolkit skills status` 纳入状态文件登记的目标（不只统计现场目录），软链目标不存在时判为悬空、不再误报 `link-ok`
- 修复：`toolkit skills install --force` 不再把已登记的副本落点翻回软链（冲突解除与落点形态解耦，保留用户既有落点形态）
- 修复：`toolkit skills remove` 回收残留空目录；`skills status` 对软链落点标注「写入将穿透至源目录，改内容请改真源」
- 修复：`toolkit tasks --import` 生成的归档块不再重复 H1，并保留来源 `updated` 字段（缺省时才用当天）
- 修复：`toolkit tasks archive` 同源多落点告警合并为一条；`depends_on` 裸标量按单元素接收、不可解析形态告警（不再静默丢依赖）
- 修复：未知 `--lang` 值回落默认语言时 stderr 告警，配置项类型不符回落默认值时同样告警（降级不静默）
- 修复：`tasks list` / `tasks stats` 全部 `--status` 取值非法时报错退出（退出码 1），不再静默忽略
