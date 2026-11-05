---
title: changelog（发版与更新日志）
---

# changelog（发版与更新日志）

> 基于 changesets 的发版与多语言更新日志维护。

```bash
toolkit changelog                       # 创建变更集（等价 changeset）
toolkit changelog version               # 发版 + 格式化（默认中文）
toolkit changelog --lang en version     # 指定语言
toolkit changelog format                # 仅格式化已有 CHANGELOG
toolkit changelog --history format      # 连带追溯改写历史版本块
toolkit changelog doc                   # 生成/更新文档站更新日志镜像
toolkit changelog --check doc           # 只比对镜像，不写文件
toolkit changelog status / publish      # 其余 changeset 子命令透传
```

⚠️ `changelog` 域开了选项透传（`passThroughOptions`），自有选项必须放在子命令**之前**：写 `toolkit changelog --history format` 生效，写成 `toolkit changelog format --history` 会把 `--history` 当作 changesets 的参数静默忽略。

⚠️ 帮助标志为例外：`-h` / `--help` 紧跟 `version` / `format` 时打印 changelog 本域帮助并退出，不落入透传（其余子命令的帮助标志仍透传给 changesets 输出其自身帮助）。

| 选项 | 说明 |
| --- | --- |
| `--lang <lang>` | 输出语言，默认 `zh`；内置 `zh`/`en`，其余经配置扩展；传入未定义语言时 stderr 告警并回落默认语言 |
| `--redact` / `--no-redact` | 开启/关闭隐私脱敏（默认开启；作用于 CHANGELOG 终端展示与落盘） |
| `--warn` / `--no-warn` | 开启/关闭软告警（默认开启；作用于发版前未归档任务提醒与无类型前缀条目计数告警） |
| `--history` | 追溯改写全部历史版本块（默认只处理 changesets 新写入块与无分组的最新版本块） |
| `--check` | `doc`：只比对镜像页与根 CHANGELOG，不写文件；不一致时输出首个差异行并以 1 退出 |
| `--from <path>` / `--to <path>` | `doc`：根 CHANGELOG 与镜像页路径，默认 `CHANGELOG.md` / `docs/changelog.md` |
| `--title <text>` / `--outline <value>` | `doc`：镜像页标题与 frontmatter outline |
| `--no-frontmatter` | `doc`：不写 VitePress frontmatter |
| `--no-sync-doc` | `version`：发版后不自动同步镜像页 |

行为细节：

- `doc`：从根 `CHANGELOG.md` 生成文档站镜像页，剥离源 H1、拼固定页头并校验至少一个版本块；默认 `CHANGELOG.md` → `docs/changelog.md`；`version` 成功后自动执行一次（`--no-sync-doc` 关闭），失败只告警不阻断发版
- `version`：先透传 changesets 消费变更集，再对 CHANGELOG 做语义分组归类——**条目前缀是唯一归类信号**：`类型：` 前缀归入「新增功能 / 问题修复 / …」等分组；含英文源组的块内条目按前缀纠正到正确分组；无 `###` 分组的版本块按前缀生成规范分组（默认只处理最新一块，`--history` 处理全部版本块）；无前缀条目按所属源组标题兜底、无源组时归入其他变更；清理变更集条目双前缀伪影（以 `- ` 开头的条目会被 changesets 二次加前缀为 `- - 条目` 并缩进续行，格式化时还原为顶层条目）并补发布日期；分组标题集合随版本演进，块内无法归入任何语义分组的其它分组连同标题原样附于块末、不丢弃；历史版本块默认保留当时口径、不追溯改写（加 `--history` 追溯：历史块内条目按其类型前缀归位、无前缀条目按既有组标题归位、无分组的块按前缀生成分组，组标题统一为当前语言口径，无法识别的分组连同标题原样保留、不臆造归属）；归类前后做条目数自检（归类只应搬移条目、不应减少，减少即 stderr 告警提示人工核对，相邻重复条目合并发生在自检之后不触发）；存在未归档 active 任务时软告警，变更集条目缺 `类型：` 前缀时计数软告警
- `format`：仅对既有 CHANGELOG 做同样的语义分组归类与格式化（默认只处理 changesets 新写入块与无分组的最新版本块，加 `--history` 处理全部版本块）；变更集条目缺类型前缀时同样计数软告警
- 类型前缀只作归类信号：归类后条目已识别的 `类型：` 前缀被剥离（`- 修复：xxx` → `- xxx`），类型由分组标题承接，避免重复；未识别的前缀（如正文里的 `说明：`）与依赖源条目 `- Updated dependencies`（续行承载包版本）原样保留；语言未声明 `groups` 时不改分组、只剥离可识别前缀
- 其余子命令（`add`/`status`/`publish`/…）原样透传给 changesets
- ⚠️ Node 18 与 Node 20.0–20.18 下依赖 changesets 的子命令不可用（上游 ESM-only 限制需宿主默认开启 `require(esm)`，即 Node ≥ 20.19.0、22 线 ≥ 22.12.0），`format` 等纯格式化不受影响

## 相关页面

- 上一篇：[规范载体](./conventions)
- 下一篇：[技能分发](./skills)
- 参考：[完整攻略 · 多语言 CHANGELOG](../guide#多语言-changelog) · [配置参考 · changelog](../config#changelog-语言表)
