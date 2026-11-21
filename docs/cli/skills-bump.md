---
title: 技能版本递增（skills bump）
---

# 技能版本递增（skills bump）

> 同源改写 `SKILL.md` 的两处版本声明；技能版本独立于产品包版本，内部规则变更即递增。

```bash
toolkit skills bump fxri-plan-to-task patch   # 单技能 patch 递增
toolkit skills bump --all --dry-run           # 预演批量递增，只打印 from → to
toolkit skills bump --all minor --yes         # 非交互批量递增须显式 --yes
toolkit skills bump fxri-plan-review --set 2.0.0 # 直接设定版本（与递增类型互斥）
toolkit skills bump --dir skills --all patch  # 外部仓：对指定技能目录批量递增
toolkit skills bump --dir a/skills --dir b/skills --all patch --yes # monorepo 多根
toolkit skills bump fxri-plan-review --from body # 两处版本不一致时以正文为准
```

## 行为

- **两处同源改写**：frontmatter `metadata.version` 与正文首部「本技能版本」同时改为新值；正文缺版本行或 frontmatter 缺版本行直接报错
- **两处不一致**：默认报错并提示先运行 `toolkit skills lint`；用 `--from frontmatter|body` 显式选择源头后再递增，不静默猜测
- **多根目录**：`--dir` 可重复；缺省为本包 `skills/`；跨根同名技能直接报错
- **写回前校验**：按待写内容跑一遍 `toolkit skills lint`（内存校验，不重复落盘），存在错误时整体中止、不写半截
- **预演**：`--dry-run` 只打印 `from → to`，不写盘，但仍按待写内容校验
- **确认**：`--all` 在交互态需确认；非交互环境须显式 `--yes`
- **输出**：stdout 为数据（文本或 `--format json` / `--json`），诊断写 stderr

## 外部仓接入

工具仓在发布前执行，不新增仓内脚本：

```bash
toolkit skills bump --dir skills --all patch
```

用 `toolkit skills lint skills/ --base <ref>` 先行校验规范与递增，详见[技能校验](./skills-lint)。

## 退出码

| 退出码 | 含义 |
| --- | --- |
| `0` | 递增成功（含 `--dry-run` 与取消确认） |
| `1` | 参数冲突、技能缺失、两处版本不一致、写回前校验未通过等 |
| `130` | 交互确认中按 Ctrl+C 中断（不写任何文件） |

## 相关页面

- 参考：[技能分发](./skills) · [技能校验](./skills-lint) · [退出码](./exit-codes)
