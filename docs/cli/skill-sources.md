---
title: 技能来源（skill source）
---

# 技能来源（skill source）

> `--source <name|path>` 的外部来源格式、曾用名、永久登记与安装锁；安装命令、选择与现场体检见 [技能分发](./skill)。

## 纳入与缓存

`--source <name|path>` 把已登记来源名、符合技能源格式的本地目录或 Git 远程地址纳入同一套 tier / 选择 / 状态 / prune 管理；
`--from` 已弃用为隐藏别名，命中时 stderr 提示改用 `--source`。

- 远程地址支持 `https://`、`ssh://`、`git@`、`github:owner/repo`，可带 `#分支/标签/提交`
- 浅克隆到 `~/.toolkit/cache/skill-sources/` 缓存后复用同一套解析；缓存刷新失败时回落到旧缓存并告警
- `--save [name]` 将来源登记为永久来源（写入全局层 `skillInstall.sources`）：本地记 `root`，远程记 `url` + `ref`；
  省略名字时按清单 `name`、仓库名或目录名派生

## 来源格式

按优先级识别：

1. `skills.json` 清单，`formatVersion` 非 `"1.0"` 直接报错、不静默回退目录扫描：

   ```json
   { "formatVersion": "1.0", "name": "...", "version": "...", "skills": ["skills/a", { "path": "skills/b", "name": "b", "previousNames": ["b-old"] }] }
   ```

2. 根 `SKILL.md`：单技能来源，名称取 frontmatter `name`，缺失时取目录名
3. `<root>/skills/*/SKILL.md`：多技能来源

## 曾用名

`previousNames`：清单条目级优先，其次 `SKILL.md` frontmatter 的 `metadata.previousNames`（行内数组，语法同 `requires`）。

- 技能改名后声明旧名，选择集与状态会按别名迁移，旧名产物在下次 `install` 时按归属清理
- 只支持一级；须为单段名字（不含路径分隔符、不为 `.` / `..`），且不得与同源现用名或其他别名重复
- 违反上述约束即整源报错，不静默剔除

## 规则与安装锁

- 技能目录须落在来源根之内；清单路径或软链解析后越界即拒绝
- 同一来源内技能名重复、跨来源同名均直接报错，不静默覆盖
- 临时来源（`--source` 不带 `--save`）**只写副本**、只登记状态，不写选择集与来源配置
- 永久来源默认**软链到技能真源目录**（远程来源指向本地缓存），链接失败降级副本；`--copy` 可强制副本
- `--save` 只能与单个 `--source` 搭配；永久来源失效时安装告警跳过，可用 `toolkit skill source remove <name>` 注销
- `remove` 的 `--dry-run` 与实跑同口径：先确认来源已登记，未登记时退出 1，不会预览成「将注销」
- `status` 按来源列出 `sources`；`status` 与 `remove` 均按来源精确处理
- 远程来源的项目面状态只记地址与 ref，不写本机缓存路径
- 安装 / 卸载期间持有操作锁，避免多进程同时改写；`--dry-run` 不取锁
  - 全局 `~/.agents/.toolkit-skills.lock`、项目 `<仓库根>/.toolkit/skills.lock`
  - 锁记录 pid / host / startedAt，5 分钟过期可接管

## 相关页面

- 参考：[技能分发](./skill) · [配置参考 · skillInstall](../config/skill) · [完整攻略 · AI 技能包](../guide#ai-技能包-skills)
