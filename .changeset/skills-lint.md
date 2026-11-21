---
"@fxri/toolkit": patch
---

- 新增：`skills lint` 校验技能命名、frontmatter、版本双写、篇幅、references 与敏感信息，支持 `--base` 版本递增比对
- 新增：`skills lint` 支持多根目录、`--strict` 与 JSON 输出；退出码 0 / 1 / 2 区分无问题、校验失败与用法错误
