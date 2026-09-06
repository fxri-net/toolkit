# AGENTS.md — 本仓库 AI 协作规则

适用于任何 AI 编码工具在本仓库内开发 @fxri/toolkit 本身。本文件随 git 分发，换人、换电脑、换工具均生效。**本规则仅约束本仓库的开发过程，不适用于 toolkit 发布后使用该工具的用户项目。**

## 能力变更三方真实一致（强制质量门）

任何影响对外行为的变更——新增/修改/删除 CLI 命令、参数、输出与告警口径、skills 内容、文档中对其的结构性描述——在任务归档前必须完成三方复核，与 `toolkit tasks check` 同为不可绕过的质量门：

1. **能力自身**：代码实际行为、单元测试、CLI help 文案三者一致。
2. **文档**：`docs/` 逐篇过触达面（README、getting-started、handbook、guide、faq、cli、api、ai-rules），凡触达处措辞必须与实际行为严格一致，包括「不自动修复」「需人工确认」等限制细节；确认无触达的内容须在对话中明确说明，不得静默跳过。⚠️ **时点约束**：触达面核对在**变更方案确认时**即按此清单逐篇走查、将结论列入任务文件「影响范围」节（每篇标注 已同步 / 无触达及理由），不延迟到归档时才复核；涉及术语或措辞变更时，先 grep 全仓库定位旧措辞触达点再列清单。⚠️ **conventions 同步**：修改 AGENTS.md / docs/ai-rules.md / skills 条文的变更，须同步检查 `.tasks/conventions.md` 溯源索引对应行（一句话语义是否需要更新），随该变更同批落盘。
3. **skills**：`skills/` 下 SKILL.md 与 references 同步新能力/新流程；frontmatter `version` 随内容变更递增（小修 +patch，能力级 +minor）。
4. **变更集**：凡影响对外行为的变更，任务归档前必须在 `.changeset/` 建变更集（标注 patch/minor/major 并写用户可感知的变更描述）；归档时出现「无变更集」提示即视为本质量门未过。
5. **全局规则薄引用**：可变流程细节只进 skills（SKILL.md / references），`docs/ai-rules.md` 的「规则全文」保持薄壳——只承载稳定纪律与对 fxri-* skill 的引用，不复述可变细节；凡在 ai-rules.md 复述了可变细节的改动即视为违背本规则，须收敛回 skill。原因：全局规则是用户手动复制的快照，细节复述会让能力升级后用户侧规则失同步；收敛进 skills 后升级只需 `pnpm dlx skills update`。

## 验收方式

- grep 确认文档与 skills 措辞落地；
- `toolkit tasks check` 通过（error 与 warn 均应为 0，除非任务规格另有豁免）；
- `pnpm test` 通过。

复核发现遗漏必须当场回补，不允许「下次再说」。

## 协作流程约束

- 涉及代码编写、文件修改、命令执行的任务，先输出结构化实施方案（目标 / 实施步骤 / 影响范围 / 验证与回滚），经确认后执行；
- 动手前先做**建档评估**：涉及仓库文件改动的任务，动手前查 active/archive 判同主题——active 有同主题更新原文件、archive 有同主题且无增量则不重复建档直接执行、均无则先建档再动手（判别细节以 fxri-plan-to-task 最新版为准）；
- 任务管理全流程走 toolkit skills（先 `toolkit init` 建任务区，再建档、执行、归档、沉淀）；
- 任务时间字段按**四级时间源**取证，口径以 `skills/fxri-plan-to-task/references/task-spec.md` 最新版为准（当场打点 / 聊天记录时间戳 / git 提交时间 / 系统当前时间兜底并标注「收尾补记」）；禁止估算或时区换算，不留与 skill 重复的复制表述，避免版本漂移；
- 代码注释只保留描述最终代码逻辑的必要注释，不留过程性解释（如「先这样、后来改成那样」的演进记录）；
- 提交信息遵循 `.trae/rules/git-commit-message.md`（若存在）或遵循下述要点：全中文标题、`类型：描述` 全角冒号、祈使句、30 汉字内。

## 发版链路

发版按以下顺序分步执行，每步产物检查无误后再进行下一步：

1. **消费变更集**：`node dist/cli.js changelog version`——按 bump 类型合并 `.changeset/` 全部变更集，生成 CHANGELOG 新版本块（中文分组标题 + 发布日期）并升级 package.json 版本号；生成后人工检查润色条目，再执行 `pnpm sync:changelog-doc` 把新版本块镜像进 docs/changelog.md 更新日志页，与版本/CHANGELOG 改动同批提交；
2. **构建**：`pnpm build`——版本号从 package.json 读取进产物；
3. **提交**：版本与 CHANGELOG 改动单独提交——发版提交是链路内置动作，独立于任务收尾自动提交（即使全局规则开启任务收尾自动提交，发版提交仍按本链路单独执行，不与普通任务收尾混批）；
4. **打标签**：提交落盘后立即打 `vX.Y.Z` 标签并用 `git tag` 核对存在；发现历史版本漏打时，在对应发版提交上补打轻量标签；
5. **发布**：`pnpm publish`；
6. **推送**：`git remote` 遍历当前**全部已配置远端**逐一推送（配几个推几个，数量不固定）——推送前先向用户列出将推送的远端清单，经确认后执行；用户显式指定单端（如「先推 github」）时按其字面只推该端，不套用全量。

⚠️ package.json 的 `release` script 仅含 `build && publish`，不含 version 步骤——禁止直接跑 `pnpm release` 发版。

## 本仓库能力自举

本仓库即 @fxri/toolkit 源仓库，开发时直接使用仓库内最新能力，不依赖全局或项目内安装的（可能过期的）副本：

- skills：需要查阅/遵循技能指引时，直接读仓库内 `skills/` 下的 SKILL.md 与 references（源文件即最新版）；全局安装的 skills 仅在发版后同步，仓库内与全局不一致时以仓库内为准；
- CLI：执行 `toolkit` 命令时使用 `node dist/cli.js` 直调本仓库产物；修改 `src/` 后先 `pnpm build` 再执行，保证验证的是最新代码。
