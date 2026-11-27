# 任务流程内告警的轻量处置

> `task check` / `status` 已是任务流程的常规步骤；本文件只规定「看到告警后怎么问、怎么修」，不新增检查命令。只读命令保持只读，修复由用户确认后单独执行（确认 / 拒绝的表达不限）。

## 何时使用

- `toolkit task check` 或 `toolkit status` 报出可修复告警时
- 只处理 **Tier 1** 中当前命中的项；Tier 2 与只报告项不并入自动提议

## 交互规则

1. **按修复命令分组**：同一命令覆盖多个告警只征得一次确认；不同命令分别征得确认。
2. 每次给出**告警摘要 + 将执行的命令 + 影响范围**；用户确认或拒绝即可，口头同意 / 选择确认 / 明确说不做等等价表达均可。
3. 用户确认 → 执行该命令；命令自身有预览 / 确认时按其流程走，不强行加 `--yes`。
4. 用户拒绝 → 记录并继续当前任务，不阻断。
5. 非 TTY / CI / `--format json`：**只报告，不询问、不写盘**。
6. `task check` / `status` 本身不写文件；修复命令是独立的写动作。

## Tier 1：可安全自动修复（按命令逐条征得确认）

| 告警 | 修复命令 | 说明 |
| --- | --- | --- |
| 入口壳版本 / 正文漂移、本地配置未 gitignore | `toolkit task init` | 幂等；只写已存在壳与忽略行 |
| 任务区归档块 / BOM / 表格填充 | `toolkit task normalize --fix` | 只改任务区，可重复执行 |
| 规范载体表格填充、索引单元格形态 | `toolkit convention format` | 幂等，跳过代码块；语义列只报不改 |
| 载体 v1/v2、旧段名、旧工程脚本、技能旧名、旧 `.bak` | `toolkit upgrade` | 自带预览 / 确认 / 备份 / `--restore` |
| 技能待收敛（缺失 / 悬空 / 副本漂移 / 入口壳过期） | `toolkit skill install` | 只补齐已选技能与目标 |
| 规则快照与当前版本不一致 | `toolkit rule sync` | 重写项目内规则快照 |
| 使用索引与事件不一致、重复事件 | `toolkit usage data rebuild` / `toolkit usage data dedupe` | 派生数据，可重建 |
| 任务区本机路径 | `toolkit privacy scan --fix`（仅任务区） | 文档 / 技能中的路径仍人工处理 |

## Tier 2：需预览或选择，不并入自动提议

| 告警 | 命令 / 动作 | 原因 |
| --- | --- | --- |
| 技能版本双写位不一致 | `toolkit skill bump <name> patch` | patch / minor 需按语义确认 |
| Hook 旧命令 / 路径失效 | `toolkit usage setup hooks install --agent <id>` | 写 Agent 配置，可能需确认目标 |
| 作用域产物未收敛 | `toolkit skill reconcile` | 写项目产物，先看漂移范围 |
| 文档主题漂移 | `toolkit docs theme --write` | 覆盖生成主题文件 |
| 未登记技能残留 / 旧名产物 | `toolkit skill uninstall --skills ...` | 删除动作，需单独确认 |

## 只报告，不提议

- 变更集缺类型前缀 / 裸行、规范载体异常形态、索引语义警告、历史 ID 补录；
- CI 配置里的旧命令、文档导航 / 产物 / 死链、规则锚点、任务依赖环；
- 文档 / 技能里的本机路径、无法自动改的 `.gitignore` 覆盖、`git rm --cached` 等。

## 不做

- 不在 `task check` / `status` 内写盘；
- 不把 Tier 2 与只报告项包装成「一键修复」；
- 不在非交互环境询问或自动执行；
- 不为单个告警新增命令或开关。
