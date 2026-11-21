---
"@fxri/toolkit": patch
---

- 新增：`skills bump` 支持 `--dir` 多根目录，外部工具仓可直接复用版本递增
- 新增：两处版本不一致时默认报错，可用 `--from frontmatter|body` 显式选择源头
- 优化：写回前按待写内容运行一次 `skills lint`，校验未通过时不写任何文件
