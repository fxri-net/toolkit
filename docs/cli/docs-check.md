---
title: docs nav / docs dist（文档站校验）
---

# docs nav / docs dist（文档站校验）

> 按同一份数据契约校验导航结构与构建产物；规则随包分发，各站点不再各自维护校验脚本。

```bash
toolkit docs nav check                  # 校验 docs/site-nav.json 的结构与导航规则
toolkit docs nav check --format json    # 机器可读输出（含规则版本）
toolkit docs nav check --dir <path>     # 指定文档目录（缺省 docs）
toolkit docs nav init                   # 从站点配置抽取 nav / sidebar 生成 site-nav.json
toolkit docs nav init --force           # 已存在 site-nav.json 时覆盖
toolkit docs dist check                 # 校验构建产物：404 不进 sitemap 与站内搜索索引
toolkit docs dist check --format json   # 机器可读输出（含规则版本与跳过标记）
```

裸 `toolkit docs nav` / `toolkit docs dist` 打印各自子命令帮助（列出 `check`）。

## 数据单一真源

导航与侧栏写在 `docs/site-nav.json`，站点配置只做引用展开：

```ts
import siteNav from '../site-nav.json'

export default defineConfig({
  themeConfig: { nav: siteNav.nav, sidebar: siteNav.sidebar },
})
```

结构定义随包分发（`schemas/site-nav.schema.json`），编辑器可据此补全；`docs nav check` 先按同一份 schema 校验结构，
字段拼错（如把 `link` 写成 `linkk`）或类型不符会直接报出字段路径，再进入导航规则。

结构定义已覆盖 VitePress 官方 `NavItem` / `SidebarItem` 的常用字段：`activeMatch`、`rel`、`target`、`noIcon`、`base`、`docFooterText`。
用到清单外字段时须先扩充 schema；检查器遇到未支持的关键字会直接报错，不会静默放过。

⚠️ 文件缺失时命令报错并提示迁移，不会回退去解析 `config.mts`：源码解析对写法敏感，跨 VitePress 版本不稳定。

## 规则清单

| 规则 id | 级别 | 判定 |
| --- | --- | --- |
| `nav/file-missing` | error | 未找到 `docs/site-nav.json` |
| `nav/schema-invalid` | error | 结构不符 schema |
| `nav/max-items` | error | 顶栏一级项超过 5 个 |
| `nav/first-item` | error | 首项不是「快速开始」 |
| `nav/last-item` | error | 末项不是「帮助」 |
| `nav/help-children` | error | 「帮助」不是下拉，或缺少「常见问题」「更新日志」 |
| `nav/group-name-length` | error | 顶栏一级项或侧栏分组名超过 4 个汉字 |
| `nav/not-found-page` | error | 缺少 `docs/404.md`，或其 frontmatter 缺 `search: false` |
| `nav/config-not-wired` | error | 站点配置未引用 `site-nav.json`，数据不会生效 |
| `nav/page-size` | warn | 单页超过 300 行（`changelog.md` 除外）；只统计本仓自身页面，依赖与产物目录下的 md 不计入 |
| `dist/sitemap-missing` | error | 产物缺少 `sitemap.xml` |
| `dist/sitemap-404` | error | `sitemap.xml` 含 404 页 |
| `dist/not-found-title` | error | `docs/404.md` 缺一级标题，无法断言搜索索引 |
| `dist/search-404` | error | 站内搜索索引分块含 404 页标题 |
| `dist/search-index-missing` | warn | 未启用本地搜索，跳过 404 索引断言 |

## 迁移

已有站点用一次性助手抽取数据，省去手工搬运：

```bash
toolkit docs nav init                 # 读 docs/.vitepress/config.mts，生成 docs/site-nav.json
toolkit docs nav init --config <path> # 指定站点配置文件
```

助手只解析字面量（字符串、数字、布尔、数组、对象）；遇到变量引用、函数调用、展开语法会报错并停下，不落半截文件。检测到 `locales` 多语言配置时直接拒绝，避免把某个语言包误当成全站数据。生成后须人工核对，再把站点配置改为引用展开。

## 配置

默认值即规范口径；站点可在 `.toolkitrc.json` 的 `docs` 段显式偏离（三层合并规则见[配置参考](../config)）。

```json
{
  "docs": {
    "nav": {
      "maxItems": 5,
      "maxGroupHan": 4,
      "firstItem": "快速开始",
      "lastItem": "帮助",
      "helpChildren": ["常见问题", "更新日志"],
      "maxPageLines": 300,
      "pageSizeExclude": ["changelog.md"]
    },
    "dist": { "dir": ".vitepress/dist", "sitemap": "error", "searchProvider": "local" },
    "rules": { "nav/page-size": "off" }
  }
}
```

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `docs.nav.dir` | `docs` | 文档目录，`--dir` 优先 |
| `docs.nav.maxItems` | `5` | 顶栏一级项上限 |
| `docs.nav.maxGroupHan` | `4` | 分组名汉字上限 |
| `docs.nav.firstItem` / `lastItem` | 快速开始 / 帮助 | 顶栏首末项文案 |
| `docs.nav.helpChildren` | 常见问题、更新日志 | 末项下拉的必备项 |
| `docs.nav.maxPageLines` | `300` | 单页体量告警阈值 |
| `docs.nav.pageSizeExclude` | `changelog.md` | 不参与体量告警的文件 |
| `docs.nav.locales` | `{}` | 各语言包的首末项与帮助必备项，未声明则跳过语言相关规则 |
| `docs.dist.dir` | `.vitepress/dist` | 产物目录，相对文档目录 |
| `docs.dist.sitemap` | `error` | sitemap 缺失时按 `error` / `warn` / `off` 处置 |
| `docs.dist.searchProvider` | `local` | 设 `none` 时跳过搜索索引断言 |
| `docs.rules` | `{}` | 按规则 id 覆盖级别，`off` 关闭该规则 |

⚠️ 类型非法或枚举取值不认识的键按未写处理并回落默认，不产出半截配置；存在规则覆盖时命令会打印覆盖清单。

⚠️ `docs theme` 没有规则 id，不参与 `docs.rules` 覆盖；主题模板的一致性仍由其自身命令判定。

## 数据结构

- 侧栏两种形态：分组数组，或「路径前缀 → 分组数组」的对象（多路径侧栏）；两种形态的分组名都参与命名校验。
- 站点两种形态：单语言 `{ nav, sidebar }`，或多语言 `{ locales: { root: {...}, en: {...} } }`。
- 多语言站须在 `docs.nav.locales` 为每个语言包声明首末项与帮助必备项；未声明的语言包只跑语言无关规则，并给一条 `nav/locale-unconfigured` 告警。

## 退出码与输出

- 存在 error 级问题退出 1，仅 warn 退出 0。
- `docs dist check` 在产物目录缺失时跳过并退出 0，是否漏跑构建由调用方判断。
- `--format json` 输出 `{ schemaVersion, command, ruleVersion, ok, problems }`。
- `problems` 每项含 `id` / `level` / `file` / `message` 四个字段。
- `ruleVersion` 独立于包版本，规则或结构变化时才递增，便于下游门禁比对。

### 规则版本

| 命令 | ruleVersion | 变更 | 首次发布 |
| --- | --- | --- | --- |
| `docs nav check` | 1.0.0 | 初版规则 | 1.16.11 |
| `docs nav check` | 1.1.0 | 支持顶栏二级分组；阈值改为可配置 | 1.16.12 |
| `docs nav check` | 1.2.0 | 字段对齐 VitePress；schema 关键字守卫 | 1.16.12 |
| `docs nav check` | 1.3.0 | 多路径侧栏与 `locales` 多语言 | 1.16.12 |
| `docs nav check` | 1.4.0 | 接线断言 `nav/config-not-wired` | 1.16.12 |
| `docs dist check` | 1.0.0 | 初版规则 | 1.16.11 |
| `docs dist check` | 1.1.0 | sitemap 可降级；产物目录与搜索实现可配 | 1.16.12 |

## 相关页面

- 参考：[文档站主题](./docs-theme) · [退出码](./exit-codes) · [完整攻略 · 文档站部署](../guide#文档站部署)
