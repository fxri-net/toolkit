# fxri Skills

零依赖 AI 技能包：纯 Markdown 规范 + 流程指令，不绑定编程语言、框架或任何工具，AI 仅凭文件读写即可完整执行；`@fxri/toolkit` 仅作为可选加速器出现（各 SKILL.md 末尾「可选加速」节）。

遵循 [Agent Skills 开放标准](https://agentskills.io)（`SKILL.md` = YAML frontmatter + Markdown 正文），可被 Claude Code、Cursor、Codex、Gemini CLI 等兼容 agent 按需加载。

## 技能列表

| 技能 | 用途 |
| --- | --- |
| [fxri-plan-to-task](./fxri-plan-to-task/SKILL.md) | 方案落盘：建档评估（先查后写）→ 建档 → 校验 → 归档 → 任务级规范沉淀（能力终点） |
| [fxri-release-changelog](./fxri-release-changelog/SKILL.md) | changesets 发版与多语言 CHANGELOG 维护 |
| [fxri-session-recap](./fxri-session-recap/SKILL.md) | 会话收尾全量沉淀 / 新会话三层恢复 / 历史任务时间批量修正 |

## 安装

### 方式一：内置命令（推荐，技能随包分发）

安装了 CLI 后，技能取自包内 `skills/`，与 CLI 同版本，**不需要第二条供应链、不需要访问 GitHub**：

```bash
pnpm add -g @fxri/toolkit   # 1. 装 CLI（npm 用户 npm i -g @fxri/toolkit）
toolkit skills install      # 2. 把包内技能装到各 agent 的全局技能目录
toolkit skills status       # 查现场状态（悬空 / 指向错误 / 副本漂移 / 缺失 / 同名冲突）
                            # 前四类重跑 toolkit skills install 补齐，同名冲突需 toolkit skills install --force 覆盖
toolkit skills remove       # 卸载本包装的产物（只清自己装的，不碰用户自装技能）
```

- 真源唯一：技能取自已装 CLI 包内的 `skills/`，升级 CLI 后重跑 `toolkit skills install` 即同步
- 目标三层：主目标 `~/.agents/skills/`（多家 agent 共读）→ 内置表内**已安装**的各 agent 全局技能目录 → `--dir <path>` 兜底（可多次指定，给表外 agent 用）
- 默认软链到真源（升级自动跟随）；链接创建失败自动降级为副本并打印 ⚠️（如无权限建链）；`--copy` 强制副本、`--dry-run` 预演、`--force` 覆盖同名非本包产物
- 产物记录在状态文件 `~/.agents/.toolkit-skills.json`；卸载 CLI 前先跑 `toolkit skills remove`，避免留下悬空链接

### 方式二：上游安装器 `npx skills`（需锁定文件或覆盖表外 agent 时）

本仓库遵循 Agent Skills 开放标准，兼容 [vercel-labs/skills](https://github.com/vercel-labs/skills) 安装器（自动识别本机 agent、写锁定文件；技能从 GitHub 拉取）：

```bash
pnpm dlx skills add fxri-net/toolkit                           # pnpm 用户（官方命令为 npx skills）
pnpm dlx skills add fxri-net/toolkit --skill fxri-plan-to-task # 只装单个技能
pnpm dlx skills list / update / remove                         # 查看 / 升级 / 卸载
# npm 用户把上述 pnpm dlx 换成 npx 即可
```

- 项目级安装默认写 `.agents/skills/` 并对各 agent 目录建立符号链接；团队项目把生成的 `skills-lock.json` 提交进仓库以对齐版本；单人多项目加 `-g` 全局安装
- 内置命令已覆盖的场景优先用方式一：方式二的技能走 GitHub、CLI 走 npm，两条供应链易出现版本漂移

#### GitHub 拉取受限时（国内网络 / 内网）

`npx skills` 只认 GitHub 源与本地路径；GitHub 不稳时改从 [Gitee 镜像](https://gitee.com/fxri/toolkit)（同源同步）克隆后走本地路径源：

```bash
git clone https://gitee.com/fxri/toolkit fxri-toolkit
pnpm dlx skills add fxri-toolkit --global       # npm 用户把 pnpm dlx 换成 npx
```

完全离线场景：先用 `pnpm pack @fxri/toolkit` 打出 tgz 拷进内网 `pnpm add -g <tgz>` 离线装 CLI，再 `toolkit skills install`（技能随包分发，全程不碰 GitHub）；详见 [FAQ · 内网或离线环境怎么装](https://fxri-net.github.io/toolkit/faq)。

### 方式三：手工复制 / 软链

- 已安装 `@fxri/toolkit` 的项目可直接使用包内自带的技能目录：`node_modules/@fxri/toolkit/skills/`，复制或软链到 agent 的 skills 目录即可
- 复制或软链技能目录到 agent 的 skills 目录（如 Claude Code 的 `.claude/skills/`）
- 支持自定义 rules 的工具（如 Trae）：链接 SKILL.md 为规则
- 通用兜底：在项目根 `AGENTS.md` 中引用本目录路径

复制副本以 frontmatter `metadata.version` 判断是否需要同步上游（`metadata.source` 指向本仓库）。

## 与其他 skills 共存

每个技能是独立目录、独立激活单元：agent 按 `description` 匹配任务按需加载，不用到的技能零上下文占用。唯一约束是目录名（即 `name`）不重复；`description` 已含反向排除，与常见通用技能重叠概率低。

## 命名约定

- `fxri-` 前缀为组织级命名空间（对应 npm scope `@fxri/`），fxri 生态新技能沿用；不使用产品级 `toolkit-` 前缀，避免暗示工具依赖
- name 全小写 kebab-case，与目录名一致，≤64 字符

## 发布前核对清单

- [ ] name：kebab-case、与目录名一致、≤64 字符
- [ ] description：≤1024 字符，含做什么 + 何时用 + 正向触发词 + 反向排除
- [ ] metadata.version：内容变更即递增
- [ ] 主干 SKILL.md < 200 行，细节下沉 `references/`，可复制资产放 `assets/`
- [ ] 引用的 references / assets 相对路径有效
- [ ] 技能用途描述已同步 docs/guide 技能表与本文「技能列表」表（含版本标注）
- [ ] 变更已走本仓库质量门：三方一致 + tasks check + pnpm test
