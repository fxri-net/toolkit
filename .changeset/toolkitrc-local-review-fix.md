---
"@fxri/toolkit": patch
---

- 修改：段值非对象（如 `"tasks": "oops"`、`"tasks": null`）的降级校验前移到三层读取路径，全局层 / 项目层与本地层口径统一——此前全局 / 项目层的这类问题只在运行时惰性告警，`toolkit config status` 取不到降级记录，同一现场两种口径
- 修改：`tasks.dir` 写空字符串不再静默回落——与类型不符同办，stderr 告警并按未写处理、回落默认 `.tasks`（降级不静默）
- 修改：`toolkit config status` 的「来源层」判定改为按分层覆盖语义（本地层段内字段级覆盖、项目层段级整体覆盖全局），修正此前项目层写了某段时该段未写字段被误报为全局层来源的问题
- 修改：`toolkit config status --format json` 的层状态字段 `levels[].hit` 改名为 `levels[].present`（`present` 仅表示配置文件存在，解析失败仍为 `true`）——对外契约变更，消费该字段的脚本需同步调整
- 修改：`toolkit config status` 文本模式下待处理项文案内嵌的路径一并折叠 home 前缀为 `~/…`（`--format json` 仍输出绝对路径）
- 修改：`toolkit config status` 新增两条 info 级提示——检测到 home 目录下的 `.toolkitrc.local.json`（按设计不参与本地层向上查找）时提示改放项目目录、出现未知配置段名（疑似拼写错误）时提示本版本未读取；info 不计入 warnings、不影响 CI
- 修改：`toolkit config status` 兜底异常不再置非 0 退出码，与「只读体检、退出码恒 0」的既有契约对齐
- 文档：`toolkit config status` 补充报告字段说明——`env[]` 命中口径为「已设置且非空，不代表开启」（`FX_REDACT=0` / `FX_CHECK_WARN=0` 会被列出但实际关闭该能力，`FX_NO_UPDATE_CHECK` 设真值反而关闭更新检查）；`items[].scope` 取值枚举为 `配置` / `本地层`；并明确报告仅 `summary` / `items[]` / `warnings` 为稳定契约
