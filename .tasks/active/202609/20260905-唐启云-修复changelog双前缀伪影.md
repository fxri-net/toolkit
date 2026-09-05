---
owner: 唐启云
status: 待办
created: 20260905
updated: 20260905
completed: ''
depends_on: []
scope: cli
---

# 修复 changelog 双前缀伪影

## 背景

变更集条目以「- 」开头时，changesets 写入 CHANGELOG 产生「- - 条目」首行 + 后续行 2 空格缩进的伪影，1.7.1 / 1.7.2 发版均需人工润色。根因已源码实证：apply-release-plan 对以「- 」开头的 summary 二次加前缀并缩进续行。

## 修法

- src/changelog/format.ts：哈希前缀清理之后新增行级归一——「- - x」还原为「- x」；其紧跟的连续「  - 」行去缩进还原为顶层条目（仅限伪影块，不影响「- 标题 + 缩进子项」的正常嵌套）
- src/__tests__/changelog.test.ts：新增 2 例（伪影还原、正常嵌套不动）
- docs/cli.md：version 行为描述补「清理变更集条目伪影」
- skills/fxri-release-changelog：references/changelog-format.md 补对应说明，SKILL.md frontmatter version +patch
- .changeset/ 新增 patch 变更集一枚

## 影响范围

- changelog format/version 输出行为；formatChangelog 函数签名不变，API 文档无触达

## 验证方式

- pnpm typecheck / test / build 全绿（含新增用例）
- 对当前仓库执行 changelog format 应零改动（1.7.2 已人工润色，无残留伪影）
