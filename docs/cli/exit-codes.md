---
title: 退出码与解析错误
---

# 退出码与解析错误

> 退出码含义与解析错误的提示口径。下表由 `src/exit-codes.ts` 生成，**不要手改**：调整数值或含义请改常量后重新生成。

<!-- toolkit:exit-codes:start -->
| 退出码 | 常量 | 含义 | 场景 |
| --- | --- | --- | --- |
| `0` | OK | 成功（含 check 通过、归档跳过等正常路径） | 全部命令 |
| `1` | FAIL | 操作失败或校验存在 error 级问题（参数冲突、非法子命令、文件 / 目录异常等） | 全部命令 |
| `2` | INTERACTIVE / USAGE | 需要交互但当前环境不支持；或 skill lint 的用法错误（非法数值、空 --base 等） | wizard、写确认命令、skill lint 参数校验 |
| `3` | GUARD_INACTIVE | 内容闸门判定当前目录未激活（stdout 为空，原因写 stderr） | scope guard |
| `130` | CANCEL | 用户在交互提示中按 Ctrl+C 中断（不写任何文件、不打印堆栈） | 所有交互提示 |
<!-- toolkit:exit-codes:end -->

软告警（warn 级）不影响退出码。退出码 `3` 只用于内容闸门的「未激活」判定，调用方据此停止而不读取正文。
全局 `--cwd` 指向不存在或非目录的路径时按 `1` 退出，不回落当前目录。

`--format json` 的业务失败仍在 stderr 报错并保留上表退出码，不在 stdout 输出半截 JSON；报告类成功输出的统一信封
`{ schemaVersion, command, ok, data, issues }` 中，`ok` 反映报告结论（check 类按是否存在 error，只告警时仍为 `true`）。

交互中断固定为 `130`，与 shell 对 SIGINT 的惯例一致：`scope` / `usage` / `skill` / `rule` 等命令在提示中按 Ctrl+C 都以此结束，不再回落为 `0` 或 `1`。
`scope` 交互里的「← 返回」与 ESC 属于正常导航（回到上层菜单），不产生中断退出码；主动选择「退出」按成功计 `0`。
需要交互但没有可用终端的命令（`toolkit scope wizard`、`toolkit usage setup wizard`、`toolkit usage setup init` /
`toolkit usage setup uninstall` / `toolkit usage config upload setup` / `toolkit usage setup hooks install` /
`toolkit usage setup hooks remove`、`toolkit task add` / `task update` 的写确认、`toolkit config set` / `config unset` 的写确认）
统一输出 `⚠️` 提示并以 `2` 结束，提示里给出等价的非交互参数。
`scope` 写命令是已知例外：非 TTY 下带显式参数直接执行并以 `0` 结束，不要求 `--yes`（见[作用域](./scope)）。
输入被关闭（非 TTY / EOF）与用户中断分开处理：前者按无交互约定（`2`）结束，后者按取消约定（`130`）结束，不把环境问题记成用户取消。
裸 `toolkit scope` / `toolkit usage` 不在此列：非 TTY 下输出摘要并成功退出。

未知命令、未知选项、参数个数不符等解析错误统一输出 `⚠️` 开头的中文提示，并附一行 `运行 toolkit --help 查看可用命令` 指引（退出码 `1`），不再混出 commander 的英文原文。
`release` 透传给 changesets 的英文输出不在其列——那属第三方 CLI 自身的报错通道。

## 相关页面

- 参考：[CLI 参考](../cli) · [常见问题](../faq)
