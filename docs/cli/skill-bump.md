---
title: 技能版本递增（skill bump）
---

# 技能版本递增（skill bump）

> 同源改写 `SKILL.md` 的两处版本声明；技能版本独立于产品包版本，内部规则变更即递增。

```bash
toolkit skill bump fxri-plan-task patch   # 单技能 patch 递增
toolkit skill bump --all --dry-run           # 预演批量递增，只打印 from → to
toolkit skill bump --all minor --yes         # 非交互批量递增须显式 --yes
toolkit skill bump fxri-plan-review --set 2.0.0 # 直接设定版本（与递增类型互斥）
toolkit skill bump --dir skills --all patch  # 外部仓：对指定技能目录批量递增
toolkit skill bump --dir a/skills --dir b/skills --all patch --yes # monorepo 多根
toolkit skill bump fxri-plan-review --from body # 两处版本不一致时以正文为准
```

## 行为

- **两处同源改写**：frontmatter `metadata.version` 与正文首部「本技能版本」同时改为新值；正文缺版本行或 frontmatter 缺版本行直接报错
- **两处不一致**：默认报错并提示先运行 `toolkit skill lint`；用 `--from frontmatter|body` 显式选择源头后再递增，不静默猜测
- **多根目录**：`--dir` 可重复；缺省为本包 `skills/`；跨根同名技能直接报错
- **写回前校验**：按待写内容跑一遍 `toolkit skill lint`（内存校验，不重复落盘），存在错误时整体中止、不写半截
- **预演**：`--dry-run` 只打印 `from → to`，不写盘，但仍按待写内容校验
- **确认**：`--all` 在交互态需确认；非交互环境须显式 `--yes`
- **输出**：stdout 为数据（文本或 `--format json` / `--json`），诊断写 stderr

## 外部仓接入

工具仓在发布前执行，不新增仓内脚本：

```bash
toolkit skill bump --dir skills --all patch
```

用 `toolkit skill lint skills/ --base <ref>` 先行校验规范与递增，详见[技能校验](./skill-lint)。

## 退出码

取消确认（回答否）按成功结束；Ctrl+C 中断按取消退出码结束且不写任何文件；参数冲突、技能缺失、两处版本不一致等按失败退出码结束。
数值与场景以[退出码与解析错误](./exit-codes)为单一真源。

## 相关页面

- 参考：[技能分发](./skill) · [技能校验](./skill-lint) · [退出码](./exit-codes)
