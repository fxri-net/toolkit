---
title: docs theme（文档站主题）
---

# docs theme（文档站主题）

> 校验与写入文档站主题模板，发现跨仓样式漂移。

```bash
toolkit docs theme                        # 校验默认主题目录（等同 --check）
toolkit docs theme --check                # 只校验：index.ts 全文一致、custom.css 页头与公共段一致
toolkit docs theme --write                # 写入或刷新模板，保留 brand-start / brand-end 之间的品牌段
toolkit docs theme --write --force        # 既有文件缺少品牌标记时也覆盖
toolkit docs theme --dir <path>           # 指定主题目录（缺省 docs/.vitepress/theme）
```

裸 `toolkit docs` 打印本域帮助（列出 1 个子命令）。

| 子命令 | 行为 |
| --- | --- |
| `theme` | 统一文档站主题的校验与写入。模板随包分发（`templates/docs-theme/`），`custom.css` 以 `/* fxri-docs-theme: 2.1 */` 标记版本（视觉调整升次版本、结构变更升主版本），`brand-start` 与 `brand-end` 之间为品牌与装饰变量，其后的公共视觉规则须逐字一致。`--check` 校验：`index.ts` 与模板全文一致、`custom.css` 首行版本标记一致、公共段逐字一致（报出首个差异行号）；品牌段改动不影响结果，但仍用 1.x 的 `--site-*` 令牌时会报废弃提示。`--write` 写入或刷新：保留既有品牌段并自动把 `--site-accent` / `--site-glow` / `--site-shadow` / `--site-hero-angle` 迁移为 `--fx-accent` / `--fx-accent-soft` / `--fx-shadow` / `--fx-hero-angle`，只替换页头与公共段；既有文件缺少标记行时报错，需加 `--force` 才覆盖。`--check` 与 `--write` 互斥，同时出现按参数错误退出（退出码 1） |

⚠️ 公共段承载中性画布与文字令牌、`--fx-*` → `--vp-*` 映射（含行内代码与主按钮）、首页首屏氛围、hero 行宽、卡片描边与悬浮、表头底色、代码块圆角、侧边栏强调、键盘焦点与动效偏好；需要站点差异时只改品牌段里的 `--fx-accent` / `--fx-accent-strong` / `--fx-accent-soft` / `--fx-shadow` / `--fx-hero-angle`，不要把站点样式写进公共段。自定义令牌统一用 `--fx-` 前缀，`--vp-` 保留为 VitePress 契约层，不在品牌段直接改写。

⚠️ 主题文件是跨仓库复制分发，`--check` 是唯一能发现漂移的入口；建议接入各仓库的聚合验收命令，未安装全局 toolkit 时自行跳过。
