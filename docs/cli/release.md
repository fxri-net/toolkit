---
title: 发版与更新日志（release）
---

# 发版与更新日志（release）

> 基于 changesets 的发版与多语言更新日志维护。

```bash
toolkit release status                # 默认：待发布变更集概览（只读，不消费）
toolkit release bump                  # 消费变更集 + 格式化 + 同步镜像（默认中文）
toolkit release bump --lang en        # 指定语言
toolkit release bump --history        # 连带追溯改写历史版本块
toolkit release changelog             # 仅格式化已有 CHANGELOG
toolkit release changelog --history   # 连带追溯改写历史版本块
toolkit release audit                 # 列出同对象净变更候选（只提示不改写）
toolkit release mirror                # 生成/更新文档站更新日志镜像
toolkit release mirror --check        # 逐页比对（主页 + 归档页），不写文件
toolkit release mirror --dry-run      # 只列出将写入与清理的文件
toolkit release publish               # 发布已升版产物（透传给 changesets）
toolkit release changeset add         # 创建变更集（透传给 changesets）
toolkit release changeset list        # 待发布变更集只读简表
toolkit release changeset status      # 待发布变更集状态（透传给 changesets）
```

`status` 为默认命令，只读概览；`bump` / `changelog` / `mirror` / `audit` 为本包自处理子命令，
选项写在各自子命令之后（`release changelog --history`、`release bump --lang en`）。

`changeset add` / `changeset status` 的参数原样透传给 changesets；`changeset list` 为只读简表，与 `status` 概览同源。
`status` / `changeset list` 的 `--format json` 走统一信封（`data` 内含 `total` / `changesets`）；`changeset add` / `status` 属透传数据流，
保持 changesets 自身的输出格式，不套信封。
`release status` 现为只读概览，不再是 changesets 透传；旧写法 `changelog version` / `format` / `doc` / `add` 仍可用，
命中时 stderr 给出弃用提示，后续版本移除。

| 选项 | 适用子命令 | 说明 |
| --- | --- | --- |
| `--lang <lang>` | bump / changelog / mirror | 输出语言，默认 `zh`；内置 `zh`/`en`，其余经配置扩展；传入未定义语言时 stderr 告警并回落默认语言 |
| `--redact` / `--no-redact` | bump / changelog / mirror | 开启/关闭隐私脱敏（默认开启；作用于 CHANGELOG 终端展示与落盘） |
| `--warn` / `--no-warn` | bump / changelog / mirror | 开启/关闭软告警（默认开启；作用于发版前未归档任务提醒与无类型前缀条目计数告警） |
| `--history` | bump / changelog | 追溯改写全部历史版本块（默认只处理 changesets 新写入块与无分组的最新版本块） |
| `--exclude <dirs>` | bump / changelog | 额外跳过的目录，逗号分隔；默认已跳过依赖安装目录、构建产物与 gitignore 覆盖的目录 |
| `--include <dirs>` | bump / changelog | 强制处理的目录，逗号分隔；优先于默认跳过名单 |
| `--no-sync-doc` | bump | 发版后不自动同步镜像页 |
| `--check` | mirror | 逐页比对主页与归档页，不写文件；报告首个差异页并汇总缺页 / 多页 / 内容差异，有差异时以 1 退出 |
| `--dry-run` | mirror | 只列出将写入与清理的文件清单，不写盘 |
| `--from <path>` / `--to <path>` | mirror | 根 CHANGELOG 与镜像页路径，默认 `CHANGELOG.md` / `docs/changelog.md` |
| `--title <text>` / `--outline <value>` | mirror | 镜像页标题与 frontmatter outline |
| `--no-frontmatter` | mirror | 不写 VitePress frontmatter |

行为细节：

- `audit`：只读扫描 `.changeset/*.md`，先按显式对象标识（反引号、`fxri-*`、`toolkit <命令>`、`--flag`）聚合，再用自然语言短语相似度兜底
  - 同一对象出现至少两种净变更类型时列出候选，不修改任何文件
- `mirror`：从根 `CHANGELOG.md` 生成文档站镜像页，剥离源 H1、拼固定页头并校验至少一个版本块
  - 默认 `CHANGELOG.md` → `docs/changelog.md`
  - `--lang` 非默认语言（如 `en`）时默认路径追加语言后缀（`CHANGELOG.en.md` → `docs/changelog.en.md`），见[语言与镜像](../config/changelog)
  - 按主版本分页（`changelogDoc.split`，默认 `major`）：主页保留最新主版本，其余主版本归档为 `docs/changelog/<major>.x.md`
  - 主页紧随页头追加一行「历史版本」入口；只有单一主版本时不拆页、不加入口，输出与原整篇镜像逐字一致
  - 归档目录取镜像目标去扩展名的同名目录（`docs/changelog.md → docs/changelog/`、`docs/changelog.en.md → docs/changelog.en/`），中英归档互不覆盖
  - 归档页带生成标记，同步只删除带标记且本次不再生成的页；无标记的多余页保留并提示人工处理
  - `--dry-run` 只打印将写入与清理的文件清单，不写盘；`--check` 逐页比对并以 1 退出表示待同步
  - `bump` 成功后自动执行一次（`--no-sync-doc` 关闭），失败只告警不阻断发版
- `bump`：先透传 changesets 消费变更集，再对 CHANGELOG 做语义分组归类——**条目前缀是唯一归类信号**。
  - 改写范围只覆盖本仓自身的包：跳过依赖安装目录（`vendor`、`node_modules`、`.venv` 等，含 composer `config.vendor-dir` 自定义目录）
    与构建产物目录、gitignore 覆盖的目录。判据不看文件是否被 git 跟踪，把 `vendor` 提交进版本库的项目同样不会改写第三方日志
  - 归类信号：`类型：` 前缀归入「新增功能 / 问题修复 / …」等分组；含英文源组的块内条目按前缀纠正到正确分组
  - 分组生成：无 `###` 分组的版本块按前缀生成规范分组（默认只处理最新一块，`--history` 处理全部版本块）；无前缀条目按所属源组标题兜底、无源组时归入其他变更
  - 清理变更集条目双前缀伪影：以 `- ` 开头的条目会被 changesets 二次加前缀为 `- - 条目` 并缩进续行，格式化时还原为顶层条目
  - 补发布日期。分组标题集合随版本演进，块内无法归入任何语义分组的其它分组连同标题原样附于块末、不丢弃
  - 历史块默认保留当时口径、不追溯改写
  - 加 `--history` 追溯：历史块内条目按其类型前缀归位、无前缀条目按既有组标题归位、无分组的块按前缀生成分组
  - 组标题统一为当前语言口径，无法识别的分组连同标题原样保留、不臆造归属
  - 自检与告警：归类前后做条目数自检。归类只应搬移条目、不应减少，减少即 stderr 告警提示人工核对；相邻重复条目合并发生在自检之后，不触发
  - 存在未归档 active 任务时软告警，变更集条目缺 `类型：` 前缀时计数软告警
- `changelog`：仅对既有 CHANGELOG 做同样的语义分组归类与格式化（默认只处理 changesets 新写入块与无分组的最新版本块，加 `--history` 处理全部版本块）；
  遍历范围与 `bump` 相同，变更集条目缺类型前缀时同样计数软告警
- 类型前缀只作归类信号：归类后条目已识别的 `类型：` 前缀被剥离（`- 修复：xxx` → `- xxx`），类型由分组标题承接，避免重复
  - 未识别的前缀（如正文里的 `说明：`）与依赖源条目 `- Updated dependencies`（续行承载包版本）原样保留
  - 语言未声明 `groups` 时不改分组、只剥离可识别前缀
- 其余子命令（`changeset add` / `changeset status` / `publish` / `changeset pre|tag|init`）原样透传给 changesets
- 透传子命令的退出码原样返回，子进程被信号终止时按 `128 + 信号编号`（见[退出码](./exit-codes)）
- 透传子命令以 changesets 2.27 为准；运行时下限 Node.js >= 18.17.0（Node 18 已 EOL，仅保证可运行）

## 发版流程

在项目根用 `pnpm exec toolkit` 执行（全局安装时直接 `toolkit`）：

```bash
pnpm exec toolkit release changeset add          # 创建变更集（等价 changeset）
pnpm exec toolkit release bump                   # 发版 + 自动语义分组归类与组标题格式化（默认中文）
pnpm exec toolkit release changelog --lang en    # 指定语言仅格式化（内置 zh / en）
pnpm exec toolkit release changelog --history    # 连带追溯改写历史版本块
pnpm exec toolkit release mirror                 # 生成/更新文档站更新日志镜像
pnpm exec toolkit release mirror --dry-run       # 预演：只列出将写入与清理的文件
```

`bump` 成功后自动同步镜像页（`--no-sync-doc` 关闭）；镜像页由根 `CHANGELOG.md` 剥离 H1 后拼固定页头生成，
按主版本分页默认开启（`changelogDoc.split`），单一主版本时输出与整篇镜像逐字一致。
路径等可用 `release mirror` 的 `--from` / `--to` / `--title` / `--outline` 或 `changelogDoc` 配置段覆盖。

⚠️ 跨语言边界：语言在**首次归组时确定**，换语言重跑不会重新归组既有块；确需改语言只能用 `replacements` 写死「源标题 → 目标标题」映射。
分组语义与归类信号见上文「行为细节」。

## 相关页面

- 参考：[完整攻略 · 多语言 CHANGELOG](../guide#多语言-changelog) · [配置参考 · 语言与镜像](../config/changelog)
