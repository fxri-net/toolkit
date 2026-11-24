---
title: 隐私体检（privacy）
---

# 隐私体检（privacy）

> 扫描任务区、变更集、文档与技能里的本机绝对路径；档位由 [`privacy.localPaths`](../config#字段总览) 控制，默认 `off` 不执行。

```bash
toolkit privacy scan                  # 扫描并按档位决定是否阻断
toolkit privacy scan --fix            # 先归一任务区与规范载体，再扫描
toolkit privacy scan --fix --dry-run  # 只列出将改写的文件与处数，不写盘
toolkit privacy scan --format json    # 机器可读结果
```

## 扫描范围与分级

| 范围 | 档位开启后的级别 | `--fix` |
| --- | --- | --- |
| `.tasks/active/` | 提示 | 归一 |
| `.tasks/archive/`、`.tasks/conventions/` | 阻断 | 归一（只改路径，属事实更正类最小改写） |
| `.changeset/` | 阻断（内容会进 CHANGELOG 并随包分发） | 只报告 |
| `docs/`、`skills/`、`templates/rules/`、`README.md`、`SPEC.md`、`AGENTS.md` | 提示 | 只报告 |

- 命中形态：盘符路径（`D:\…`、`D:/…`）与 POSIX 家目录路径（`/Users/…`、`/home/…`）；`<本机>`、`~/`、`%USERPROFILE%` 等占位符不算命中
- 通配写法（含 `*` / `?`）与裸目录（如 `/Users/`）不命中，避免把规则示例判成泄露
- 档位 `off`（默认）：整次扫描跳过、退出码 0；`warn`：只提示；`error`：阻断项存在时退出码 1
- `--dry-run` 只与 `--fix` 搭配生效：输出与真实归一同一份「将改写的文件 + 处数」清单，不写盘；
  单独给出时按只读扫描处理并在 stderr 说明

## 与任务区体检的关系

`toolkit task check` 复用同一扫描：任务归档与规范载体里的本机路径按档位报 error / warn，`active/` 只提示。
`pnpm verify` 也包含本命令，档位 `off` 时立即通过，业务仓库无需额外配置。

## 与脱敏的关系

密钥与 PII 脱敏由 [`redact`](../config/redact) 负责，`task archive` 默认执行；本命令只管本机路径，两者互不影响。

## 相关页面

- 参考：[配置参考 · 隐私脱敏](../config/redact) · [任务区](./task) · [退出码](./exit-codes)
