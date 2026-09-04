# fxri Skills

零依赖 AI 技能包：纯 Markdown 规范 + 流程指令，不绑定编程语言、框架或任何工具，AI 仅凭文件读写即可完整执行；`@fxri/toolkit` 仅作为可选加速器出现（各 SKILL.md 末尾「可选加速」节）。

遵循 [Agent Skills 开放标准](https://agentskills.io)（`SKILL.md` = YAML frontmatter + Markdown 正文），可被 Claude Code、Cursor、Codex、Gemini CLI 等兼容 agent 按需加载。

## 技能列表

| 技能 | 用途 |
| --- | --- |
| [fxri-plan-to-task](./fxri-plan-to-task/SKILL.md) | 方案落盘：先查后写 → 建档 → 校验 → 归档 → 归档提交同批 |
| [fxri-release-changelog](./fxri-release-changelog/SKILL.md) | changesets 发版与多语言 CHANGELOG 维护 |
| [fxri-session-recap](./fxri-session-recap/SKILL.md) | 会话收尾归档结论 / 新会话恢复任务上下文 |

## 安装

### 方式一：`npx skills` 自动安装（推荐）

本仓库遵循 Agent Skills 开放标准，兼容 [vercel-labs/skills](https://github.com/vercel-labs/skills) 安装器（自动识别本机 agent、写锁定文件）：

```bash
pnpm dlx skills add fxri-net/toolkit                           # pnpm 用户（官方命令为 npx skills）
pnpm dlx skills add fxri-net/toolkit --skill fxri-plan-to-task # 只装单个技能
pnpm dlx skills list / update / remove                         # 查看 / 升级 / 卸载
# npm 用户把上述 pnpm dlx 换成 npx 即可：
# npx skills add fxri-net/toolkit / npx skills add fxri-net/toolkit --skill fxri-plan-to-task / npx skills list / update / remove
```

- 项目级安装默认写 `.agents/skills/` 并对各 agent（Claude Code / Cursor / Codex 等 75+）目录建立符号链接；团队项目把生成的 `skills-lock.json` 提交进仓库以对齐版本；**单人/个人多项目推荐 `-g` 全局安装**，所有项目直接可用，升级一条 `skills update -g`
- ⚠️ 已知上游行为（v1.5.x）：项目级安装时若 `.claude/` 目录不存在，Claude Code 目标会被静默跳过——先创建 `.claude/skills/` 空目录或改用 `-g`

### 方式二：手工复制 / 软链

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
