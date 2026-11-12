---
title: docs nav / docs dist（文档站校验）
---

# docs nav / docs dist（文档站校验）

> 按同一份数据契约校验导航结构与构建产物；规则随包分发，各站点不再各自维护校验脚本。

```bash
toolkit docs nav check                  # 校验 docs/site-nav.json 的结构与导航规则
toolkit docs nav check --format json    # 机器可读输出（含规则版本）
toolkit docs nav check --dir <path>     # 指定文档目录（缺省 docs）
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
| `nav/page-size` | warn | 单页超过 300 行（`changelog.md` 除外） |
| `dist/sitemap-missing` | error | 产物缺少 `sitemap.xml` |
| `dist/sitemap-404` | error | `sitemap.xml` 含 404 页 |
| `dist/not-found-title` | error | `docs/404.md` 缺一级标题，无法断言搜索索引 |
| `dist/search-404` | error | 站内搜索索引分块含 404 页标题 |
| `dist/search-index-missing` | warn | 未启用本地搜索，跳过 404 索引断言 |

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
| `docs.dist.dir` | `.vitepress/dist` | 产物目录，相对文档目录 |
| `docs.dist.sitemap` | `error` | sitemap 缺失时按 `error` / `warn` / `off` 处置 |
| `docs.dist.searchProvider` | `local` | 设 `none` 时跳过搜索索引断言 |
| `docs.rules` | `{}` | 按规则 id 覆盖级别，`off` 关闭该规则 |

⚠️ 类型非法或枚举取值不认识的键按未写处理并回落默认，不产出半截配置；存在规则覆盖时命令会打印覆盖清单。

## 退出码与输出

- 存在 error 级问题退出 1，仅 warn 退出 0。
- `docs dist check` 在产物目录缺失时跳过并退出 0，是否漏跑构建由调用方判断。
- `--format json` 输出 `{ schemaVersion, command, ruleVersion, ok, problems }`。
- `problems` 每项含 `id` / `level` / `file` / `message` 四个字段。
- `ruleVersion` 独立于包版本，规则集变化时才递增，便于下游门禁比对。

## 相关页面

- 参考：[文档站主题](./docs-theme) · [退出码](./exit-codes) · [完整攻略 · 文档站部署](../guide#文档站部署)
