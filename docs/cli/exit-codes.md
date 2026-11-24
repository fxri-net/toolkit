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
| `2` | INTERACTIVE / USAGE | 需要交互但当前环境不支持；或 skill lint 的用法错误（非法数值、空 --base 等） | 裸命令交互（--interactive 或 TTY）、写确认命令、skill lint 参数校验 |
| `3` | GUARD_INACTIVE | 内容闸门判定当前目录未激活（stdout 为空，原因写 stderr） | scope guard |
| `130` | CANCEL | 用户在交互提示中按 Ctrl+C 中断（不写任何文件、不打印堆栈） | 所有交互提示 |
<!-- toolkit:exit-codes:end -->

软告警（warn 级）不影响退出码。退出码 `3` 只用于内容闸门的「未激活」判定，调用方据此停止而不读取正文。
全局 `--cwd` 指向不存在或非目录的路径时按 `1` 退出，不回落当前目录。

`--format json` 的业务失败仍在 stderr 报错并保留上表退出码，不在 stdout 输出半截 JSON；报告类成功输出的统一信封
字段见[输出约定](../cli#输出约定)，其中 `code` 只反映报告结论（check 类按是否存在 error），
进程退出码另由 `extend.exitCode` 承载，两者可以不一致（如 `status` 不带 `--check`）。

交互中断固定为 `130`，与 shell 对 SIGINT 的惯例一致：`scope` / `usage` / `skill` / `rule` 等命令在提示中按 Ctrl+C 都以此结束，不再回落为 `0` 或 `1`。
按 ESC（单选还可选末位「退出」/「← 返回」）属正常导航（返回上一步或取消当前命令），一律按 `0` 结束。
需要交互但没有可用终端的命令统一输出 `⚠️` 提示并以 `2` 结束，提示里给出等价的非交互参数：
`toolkit setup`、`toolkit scope --interactive`、`toolkit usage setup --interactive`、
`toolkit usage setup init` / `toolkit usage setup uninstall` / `toolkit usage config upload setup`、
`toolkit usage setup hooks install` / `toolkit usage setup hooks remove`、`toolkit task add` / `task update` 的写确认、
`toolkit config set` / `config unset` 的写确认。
`scope` 写命令是已知例外：非 TTY 下带显式参数直接执行并以 `0` 结束，不要求 `--yes`（见[作用域](./scope)）。
输入被关闭（非 TTY / EOF）与用户中断分开处理：前者按无交互约定（`2`）结束，后者按取消约定（`130`）结束，不把环境问题记成用户取消。
裸 `toolkit scope` / `toolkit usage` 不在此列：非 TTY 下输出摘要并成功退出。

未知命令、未知选项、参数个数不符等解析错误统一输出 `⚠️` 开头的中文提示，并附一行 `运行 toolkit --help 查看可用命令` 指引（退出码 `1`），不再混出 commander 的英文原文。
`release` 透传给 changesets 的英文输出不在其列——那属第三方 CLI 自身的报错通道。

## 外部终止与断管

toolkit 不注册 SIGTERM / SIGKILL 等信号处理器：进程被外部终止时退出码不由 toolkit 决定，
由 shell 按「128 + 信号编号」呈现（SIGTERM → `143`、SIGKILL → `137`）。
`timeout` 命令超时返回的 `124` 同样属其自身约定，不是 toolkit 的输出。
`130` 只代表「在交互提示中按 Ctrl+C」，不代表任何 SIGINT 都会被转换成 `130`。

`release publish` 与 `release changeset add / status / pre / tag / init` 透传 changesets：
子进程退出码原样返回，子进程被信号终止时返回 `128 + 信号编号`，不再一律包装成 `1`。

标准输出管道被下游提前关闭（如 `toolkit --help | head -1`）时按断管处理，静默以 `0` 退出，不打印堆栈。

## 相关页面

- 参考：[CLI 参考](../cli) · [常见问题](../faq)
