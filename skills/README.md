# fxri Skills

零依赖 AI 技能包：纯 Markdown 规范 + 流程指令，不绑定编程语言、框架或任何工具，AI 仅凭文件读写即可完整执行；`@fxri/toolkit` 仅作为可选加速器出现（各 SKILL.md 末尾「可选加速」节）。

遵循 [Agent Skills 开放标准](https://agentskills.io)（`SKILL.md` = YAML frontmatter + Markdown 正文），可被 Claude Code、
Cursor、Codex、Gemini CLI 等兼容 agent 按需加载。

## 技能列表

| 技能 | 版本 | 用途 | 层级 |
| --- | --- | --- | --- |
| [fxri-plan-to-task](./fxri-plan-to-task/SKILL.md) | 1.10.8 | 方案落盘：任务分解与纯展示计划表 → 逐仓逐任务建档 → 校验 → 归档 → 任务级规范沉淀（能力终点）；规范载体迁移与升级 | core |
| [fxri-release-changelog](./fxri-release-changelog/SKILL.md) | 1.3.5 | changesets 发版与多语言 CHANGELOG 维护 | optional |
| [fxri-session-recap](./fxri-session-recap/SKILL.md) | 1.6.13 | 会话收尾全量沉淀 + 规范沉淀 / 新会话三层恢复 / 历史任务时间批量修正 | core |
| [fxri-plan-review](./fxri-plan-review/SKILL.md) | 1.0.9 | 复核已落档任务拆分：输出新增疏漏、建议与修订计划表，按 `直接落档` / `需要确认` / `仅作提示` 标记后续是否落档 | core |
| [fxri-text-encoding](./fxri-text-encoding/SKILL.md) | 1.2.5 | 文本编码：写脚本 / 配置 / 数据交换文本与跨进程 / 跨机器传递前按「生产者 × 消费者」定字节形态（临时任务同样适用），含非 ASCII 丢失 / 变形、乱码反查与首行报错 | optional |

版本号取自各 SKILL.md 的 frontmatter `metadata.version`（`toolkit skills status` / `skills install` 打印的真源版本），
与正文首部版本声明双写一致；层级取自 frontmatter `metadata.tier`（`skills` 模式 `core` 必装不可取消，`package` 模式全部可选、允许零选；
`optional` 安装时可选，缺省按 `optional` 处理）。

## 安装

### 方式一：内置命令（推荐，技能随包分发）

安装了 CLI 后，技能取自包内 `skills/`，随包同源分发（与 CLI 同一发布批次；技能内容版本独立编号，看的是各 SKILL.md 自己的版本），**不需要第二条供应链、不需要访问 GitHub**：

```bash
pnpm add -g @fxri/toolkit   # 1. 装 CLI（npm 用户 npm i -g @fxri/toolkit）
toolkit skills install      # 2. 把包内技能装到各 agent 的全局技能目录
                            #    先按 tier 选技能：core 必装、optional 可选（TTY 下方向键多选；--mode package 时 core 也可取消）
                            #    再选目标：canonical + 已检测 agent（--agent / --all-agents / --no-save-agents）
                            #    --skills <names> / --all / --no-optional / --yes 可跳过技能与目标交互
                            #    --scope project 换项目面：真源落 <仓库根>/.agents/skills/、其余候选目录落入口薄壳
                            #    --from <path|url> 临时外部来源（副本）；--save [name] 登记永久来源（默认软链）
toolkit skills status       # 查现场状态（悬空 / 指向其他版本 / 副本漂移 / 缺失 / 同名冲突 / 未选择但已安装；历史落点与疑似残留单列提示；--scope project 查项目面）
                            # 前五类重跑 toolkit skills install 补齐，同名冲突需 toolkit skills install --force 覆盖，未选择产物加 --prune 清理
                            # 来源已无此名的旧名（改名后）用 toolkit skills uninstall --skills <旧名> 清理
toolkit skills uninstall       # 卸载本包装的产物（只清自己装的，不碰用户自装技能；--skills 只清指定技能，含未登记的旧名；--scope project 清项目面）
```

- 真源唯一：技能取自已装 CLI 包内的 `skills/`；软链锚在 pnpm 稳定入口，升级 CLI 后自动指向新版（副本形式需重跑 `toolkit skills install`）
- 目标三层：主目标 `~/.agents/skills/` → 内置表内**已安装**的各 agent 全局技能目录 → `--dir <path>` 兜底
  - 主目标由多家 agent 共读，写一次即全部覆盖；`toolkit skills status` 把它们单列为「经 canonical 共读的 agent」
  - 共读 agent：Cline、Codex、Dexto、Kimi Code CLI、Loaf、Pi、Sarvam Code、Warp、Zed、DeepSeek Harness
  - `--dir` 可多次指定，供表外 agent 使用；只在当次安装时写入，技能增删后需带相同 `--dir` 重跑 `toolkit skills install`
  - 升级前的 Codex / Pi 历史落点（`~/.codex/skills`、`~/.pi/agent/skills`）若仍有本包登记，`toolkit skills status` 会单列「历史落点残留」提示清理（只提示、不自动删除）
  - 指向技能源缓存或本包技能目录、却未在任何来源 / 状态登记的链接，`toolkit skills status` 会单列「疑似残留」提示清理（同样只提示，确认后按名字 `uninstall --skills`）
- **技能改名**：外部来源可在 `skills.json` 条目或 `SKILL.md` frontmatter 声明 `previousNames`；安装时选择集与状态按别名迁移、旧名产物按归属清理。
  未声明时也不会丢：旧名断链保留登记并在 `status` 报出，来源整份名单失效时按默认口径重算（内置取 `core`、外部取全部）
- 默认软链（锚在 pnpm 稳定入口，升级不失效）；链接创建失败自动降级为副本并打印 ⚠️（如无权限建链）；`--copy` 强制副本、`--dry-run` 预演、
   `--force` 覆盖同名非本包产物（不改本包已登记副本的形态）、`--prune` 清理未选择且内容一致的旧产物
- 改 `skills/` 须发版才触达用户：技能随包同源分发，调整只有随 `@fxri/toolkit` 发版、使用者升级后才生效（软链自动跟随新包），未发版的改动只存在于本仓库
- 产物记录在状态文件 `~/.agents/.toolkit-skills.json`（`format` + `schemaVersion` + `sources` 结构，旧结构首次读取时导入并备份 `.bak`）；
   卸载 CLI 前先跑 `toolkit skills uninstall`，避免留下悬空链接（清理后目标目录若已空会一并回收）
- **项目面（`--scope project`）**：`--scope` 缺省时按 CLI 安装位置自动判定（项目内装 CLI → 项目面）
  - 真源落 `<仓库根>/.agents/skills/`（完整副本），其余**已存在**的候选目录各放每个技能一份入口薄壳指向真源
  - 产物记录在 `<仓库根>/.toolkit/state.json`（与真源、薄壳一并入库）
  - `toolkit init` 会写入 `prepare` 刷新钩子，`pnpm install` 时自动补齐/刷新，队友 clone 即用
  - `--copy` 仅全局面生效，项目面恒为副本
  - 项目级候选目录（19 个，仅在目录已存在时落壳）：

| 候选目录 | 候选目录 | 候选目录 |
| --- | --- | --- |
| `.agents/skills/`（真源） | `.trae/skills/` | `.claude/skills/` |
| `agent/skills/`（Eve） | `.augment/skills/` | `.codebuddy/skills/` |
| `.continue/skills/` | `.crush/skills/` | `.devin/skills/` |
| `.goose/skills/` | `.grok/skills/` | `.hermes/skills/` |
| `.iflow/skills/` | `.junie/skills/` | `.kiro/skills/` |
| `.openhands/skills/` | `.qwen/skills/` | `.roo/skills/` |
| `.windsurf/skills/` |  |  |

- 发布型包误打包检查：`toolkit init` 在未标 `private` 且无 `files` 白名单的项目里会提示技能产物（`.agents/skills/`）与内置任务区（`.tasks/`）可能被打进 npm 包——只提示、不代改

### 方式二：上游安装器 `npx skills`（需锁定文件或覆盖表外 agent 时）

本仓库遵循 Agent Skills 开放标准，兼容 [vercel-labs/skills](https://github.com/vercel-labs/skills) 安装器（自动识别本机 agent、写锁定文件；
技能从 GitHub 拉取）：

```bash
pnpm dlx skills add fxri-net/toolkit                           # pnpm 用户（官方命令为 npx skills）
pnpm dlx skills add fxri-net/toolkit --skill fxri-plan-to-task # 只装单个技能
pnpm dlx skills list / update / remove                         # 查看 / 升级 / 卸载
# npm 用户把上述 pnpm dlx 换成 npx 即可
```

- 项目级安装默认写 `.agents/skills/` 并对各 agent 目录建立符号链接；团队项目把生成的 `skills-lock.json` 提交进仓库以对齐版本；单人多项目加 `-g` 全局安装
- 内置命令已覆盖的场景优先用方式一：方式二的技能走 GitHub、CLI 走 npm，两条供应链易出现版本漂移
- ⚠️ 两条路径不要混用：上游安装器把技能落成**实体副本**，且不在本包状态文件 `~/.agents/.toolkit-skills.json` 的登记内，
   内置命令会把它判为「同名非本包产物」——混用后 `toolkit skills status` 报「同名冲突」，
   且再跑一次 `pnpm dlx skills update -g` 会把 `~/.agents/skills/` 重写回实体副本，冲突复发
- 已用方式二装过、想换回方式一：`toolkit skills install --force` 一键接管同名旧副本，详见 [常见问题](https://fxri-net.github.io/toolkit/faq)

#### GitHub 拉取受限时（国内网络 / 内网）

`npx skills` 只认 GitHub 源与本地路径；GitHub 不稳时改从 [Gitee 镜像](https://gitee.com/fxri/toolkit)（同源同步）克隆后走本地路径源：

```bash
git clone https://gitee.com/fxri/toolkit fxri-toolkit
pnpm dlx skills add fxri-toolkit --global       # npm 用户把 pnpm dlx 换成 npx
```

完全离线场景：先用 `pnpm pack @fxri/toolkit` 打出 tgz 拷进内网 `pnpm add -g <tgz>` 离线装 CLI，再 `toolkit skills install`（技能随包分发，
全程不碰 GitHub）；详见 [FAQ · 内网或离线环境怎么装](https://fxri-net.github.io/toolkit/faq)。

### 方式三：手工复制 / 软链

- 已安装 `@fxri/toolkit` 的项目可直接使用包内自带的技能目录：`node_modules/@fxri/toolkit/skills/`，复制或软链到 agent 的 skills 目录即可
- 复制或软链技能目录到 agent 的 skills 目录（如 Claude Code 的 `.claude/skills/`）
- 支持自定义 rules 的工具（如 Trae）：**不要把 SKILL.md 链接为规则**——规则会常驻上下文，等于绕过按需加载；
   应放入技能目录（`toolkit skills install` 已覆盖 Trae 技能目录）。仅当确需该技能每轮常驻时，才考虑链接为规则。
- 通用兜底：在项目根 `AGENTS.md` 中引用本目录路径

复制副本以 frontmatter `metadata.version` 判断是否需要同步上游（`metadata.source` 指向本仓库）。

## 版本声明与一致性

每个 SKILL.md 的版本写两处，须保持一致：

- frontmatter `metadata.version`：机器读取位，`toolkit skills status` / `skills install` 打印的真源版本取自这里
- **正文首部**的 `> 本技能版本 x.y.z（随 @fxri/toolkit 同批分发）`：进上下文的自证位——agent 加载技能正文即见到它，被问版本时报这个值（不读磁盘、不跑 CLI），
   与 `toolkit skills status` 的磁盘基准值一比对，就能判断当前会话上下文是否已过期

两处不一致会误导版本比对，故内容变更时同步递增、发布前逐项核对（见下方核对清单）。

## 与其他 skills 共存

每个技能是独立目录、独立激活单元：兼容 agent 会把各技能的 `description` 常驻上下文用于匹配触发，正文仅在触发时加载、
`references/` 按需读取——不触发的技能只占 `description` 这一层，不占正文体积。唯一约束是目录名（即 `name`）不重复；`description` 已含反向排除，与常见通用技能重叠概率低。

- **触发只靠语义**：`description` 以意图画像 + 近义表达描述并带反例排除，个人口头禅不进通用触发词（示例非穷举）；触发判据优先取上下文中可观测的事实（动作、产物类型、写入通道、症状），
   临时 / 一次性 / 不入库不构成豁免。

## 命名约定

- `fxri-` 前缀为组织级命名空间（对应 npm scope `@fxri/`），fxri 生态新技能沿用；不使用产品级 `toolkit-` 前缀，避免暗示工具依赖
- name 全小写 kebab-case，与目录名一致，≤64 字符
- 规则归属判据：把一条规则写进技能前先问该技能的定位是否就是这类规则的归属域——是则条文只留技能一处、其余载体只留指针，不是则留在原载体

## 发布前核对清单

> 本节仅本包维护者发布 `@fxri/toolkit` 时适用；使用技能的用户项目无需执行。

- [ ] name：kebab-case、与目录名一致、≤64 字符
- [ ] description：≤1024 字符，含做什么 + 何时用 + 触发意图与示例（示例非穷举）+ 反向排除
- [ ] metadata.version：内容变更即递增，且与正文首部版本声明一致
- [ ] 主干 SKILL.md < 200 行且 ≤ 8,000 字符，细节下沉 `references/`，可复制资产放 `assets/`
- [ ] 引用的 references / assets 相对路径有效
- [ ] 技能用途描述已同步 docs/guide 技能表与本文「技能列表」表（含版本标注）
- [ ] 涉规范载体（conventions）的改动：
   `fxri-session-recap/SKILL.md` 的 R3 压缩要点已与 `fxri-plan-to-task/references/conventions-spec.md` 同步（引用兄弟技能
   references 时须用相对路径并给出包内真源兜底，两处不一致即失一致）
- [ ] 涉规范载体（conventions）的改动：`src/init.ts` 的 `index.md` / `history.md` 骨架模板与入口壳版本分流、
   `src/tasks/validate.ts` 的形态告警口径、`src/conventions/` 的形态识别与升级链路、
   `src/conventions/entry.ts` 的入口壳生成与版本告警已同步（CLI 侧与 skills 细则同源）
- [ ] 发布前跑 `toolkit changelog audit`，有同对象净变更候选先人工合并；该检查只提示，不挂进 `pnpm verify`
- [ ] 变更已跑 `pnpm verify` 全绿（单一步骤清单真源，步骤见 `scripts/verify.mjs`）；能力 / 文档 / 技能三方一致已按 `AGENTS.md` 逐篇复核
