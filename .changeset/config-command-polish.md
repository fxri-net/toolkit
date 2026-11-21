---
"@fxri/toolkit": patch
---

- 新增：`config list / get / set / unset` 支持 `--cwd`，与 `config status` 对齐；`list --layer` 只列该层可写的键
- 新增：`config list / get` 对未写键显示默认值；`--reveal` 控制敏感值是否输出原文，JSON 输出默认同样打码
- 优化：`config list` 一次加载三层配置，不再逐键重复读盘；`unset` 提示删除后的生效值与来源层
- 优化：`init` 忽略片段补 `.toolkitrc.json.bak` / `.toolkitrc.local.json.bak`，避免重写配置时备份文件被误提交
- 修复：配置 JSON 非法时 `init` 报「解析失败，未改写」，不再误报「已是当前写法」；数值键拒绝十六进制与科学计数法
