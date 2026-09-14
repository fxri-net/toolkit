---
"@fxri/toolkit": patch
---

文档：回补三方一致性核对发现的 8 处失同步，`tasks stats --format` 与其余命令对齐

- `docs/api.md`：`parseBool` 认值补 `yes/no`；补列 `CheckIssue` / `IssueLevel` / `NormalizeIssue` / `NormalizeResult` 四个类型导出
- `docs/guide.md`：frontmatter 字段表补 `scope`；归档规则补「块间 `---` 是任务块唯一权威边界」；技能表补版本列
- `docs/cli.md`：补 `check` / `normalize` 问题清单的 `文件:行号: 描述` 输出形态
- `skills/README.md`：技能表补版本列（取自各 SKILL.md 的 frontmatter `metadata.version`）
- `toolkit tasks stats --format` 补取值校验：非法值告警并置退出码 1，与其余命令同口径
- `AGENTS.md`：规则层锚点纪律明确 `SPEC.md` 无 fenced 包裹、整篇即快照，锚点位于正文首行即合规
