---
title: 退出码与解析错误
---

# 退出码与解析错误

> 退出码含义与解析错误的提示口径。

| 退出码 | 含义 |
| --- | --- |
| `0` | 成功（含 check 通过、归档跳过等正常路径） |
| `1` | 操作失败或校验存在 error 级问题（check 有 error、参数冲突、非法子命令、文件/目录异常等） |
| `2` | 需要交互但当前环境不支持（显式 `wizard` 与写确认类命令；stderr 给出非交互替代） |
| `3` | `toolkit scope guard <技能名>` 判定当前目录未激活（stdout 为空，原因写 stderr） |
| `130` | 用户在交互提示中按 Ctrl+C 中断（不写任何文件、不打印堆栈） |

软告警（warn 级）不影响退出码。退出码 `3` 只用于内容闸门的「未激活」判定，调用方据此停止而不读取正文。

交互中断固定为 `130`，与 shell 对 SIGINT 的惯例一致：`scope` / `usage` / `skills` / `rules` 等命令在提示中按 Ctrl+C 都以此结束，不再回落为 `0` 或 `1`。
`scope` 交互里的「← 返回」与 ESC 属于正常导航（回到上层菜单），不产生中断退出码；主动选择「退出」按成功计 `0`。
需要交互但没有可用终端的命令（`toolkit scope wizard`、`toolkit usage wizard` 及其 `init` / `uninstall` /
`upload setup` / `hooks install` / `hooks remove`）统一输出 `⚠️` 提示并以 `2` 结束，提示里给出等价的非交互参数。
裸 `toolkit scope` / `toolkit usage` 不在此列：非 TTY 下输出摘要并成功退出。

未知命令、未知选项、参数个数不符等解析错误统一输出 `⚠️` 开头的中文提示，并附一行 `运行 toolkit --help 查看可用命令` 指引（退出码 `1`），不再混出 commander 的英文原文。
`changelog` 透传给 changesets 的英文输出不在其列——那属第三方 CLI 自身的报错通道。

## 相关页面

- 参考：[CLI 参考](../cli) · [常见问题](../faq)
