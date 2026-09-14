---
"@fxri/toolkit": patch
---

优化：治理设计审计发现的 14 处不成熟点（写盘事务性、文本协议脆弱性、三方一致性）

- 写盘更稳：归档前按块标题去重（重跑幂等）；`normalize --fix` 逐文件容错，单个文件异常不再中断整轮
- 写入锁记 pid 与进程启动时间：接管前校验持有进程是否存活，释放时校验持有者为自身，降低陈旧锁被误接管的风险
- 导入契约明确并落地：`--target archive` 按块标题去重（同一份文件重复导入幂等），块内状态取自数据（不再强制改写为「已完成」）；契约已写进 `docs/cli.md`
- frontmatter 未知字段不再被丢弃：解析时原样透传并软告警，导入回写按原顺序重建
- 归档块判定改以块间 `---` 为唯一权威边界：`## 标题` 与 `> 元数据` 行降为校验项，正文内部的 `## ` 小节不再可能被误切（`SPEC.md` 同步）
- `tasks check` 与 `tasks normalize --check` 的问题输出带 `file:line`，便于编辑器跳转；库导出 `CheckIssue` 新增可选 `line` 字段
- 文档补齐：内置脱敏规则清单（`docs/config.md`、`docs/guide.md`）、`--redact` / `--warn` 的域级作用域与 `tasks` 域选项表（`docs/cli.md`）、站点导航与更新日志入口
- skills 状态检查新增版本双写位比对（frontmatter `metadata.version` 与正文声明值），不一致时软告警
- 新增机器化质量门测试：脱敏规则清单 ↔ 文档一致、`docs/*.md` 内锚点可解析、`docs/changelog.md` 与 `CHANGELOG.md` 一致、`CheckIssue.line` 行号定位
