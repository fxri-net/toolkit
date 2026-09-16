---
"@fxri/toolkit": patch
---

优化：根描述文案收敛为单一真源

- 新增 `src/about.ts` 导出 `DESCRIPTION`，CLI 根描述、站点 `description` 与 `og:description` 改为引用该常量，消除同一句话多处手写
- `toolkit --help` 首行描述补上句末句号，与 `package.json` / 文档既有文案对齐（原缺句号即由此漂移导致）
- 文档一致性用例新增根描述断言：`package.json`、`README.md` 与 `docs/index.md` 首页 tagline 的共用文案改一处漏改其余即失败
