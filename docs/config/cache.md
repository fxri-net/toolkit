---
title: 缓存目录
---

# 缓存目录

> 用户级缓存统一落在 `~/.toolkit/cache/`，只存放可安全删除的派生数据；删除后按需重建，不影响配置与统计。

## 目录布局

| 路径 | 内容 | 重建方式 |
| --- | --- | --- |
| `~/.toolkit/cache/update-check.json` | 升级检查结果与提示节流记录 | 下次命令自动刷新 |
| `~/.toolkit/cache/rules-selection.json` | 规则组合器在命令行记住的模块顺序 | 下次 `toolkit rules compose` 重新写入 |
| `~/.toolkit/cache/skill-sources/<标识>/` | 远程技能来源的浅克隆缓存 | `toolkit skills sources refresh` 或下次安装 / 状态解析 |

## 迁移与清理

- 旧路径（`{tmpdir}/.toolkit-update-check.json`、`~/.agents/.toolkit-sources/`）在首次访问时惰性迁移到新目录，成功后删除旧路径；迁移失败时继续使用旧路径，不丢缓存。
- 整个 `~/.toolkit/cache/` 可安全删除；删除后首次使用会自动重建。
- 不提供单独的清理命令：缓存不是用户数据，直接删目录即可。

## 不在缓存目录的内容

| 内容 | 位置 | 原因 |
| --- | --- | --- |
| 技能状态账本 | `~/.agents/.toolkit-skills.json`、`<repo>/.toolkit/state.json` | 记录已安装技能与选择，不是派生数据 |
| 使用情况事件 | `~/.toolkit/usage/` | 用户数据，清理需 `toolkit usage purge` |
| 锁文件 | `~/.agents/.toolkit-skills.lock`、`<repo>/.toolkit/skills.lock` | 运行时互斥状态 |

## 相关页面

- 参考：[升级检查](./update) · [技能分发](./skills) · [技能使用情况 · 配置](../usage/configuration)
