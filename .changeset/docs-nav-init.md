---
"@fxri/toolkit": patch
---

- 新增：`docs nav init` 迁移助手，从站点配置抽取 `nav` / `sidebar` 字面量生成 `site-nav.json`
- 优化：助手遇到变量引用、函数调用、展开语法等动态写法时直接报错，不落半截文件
- 优化：检测到 `locales` 多语言配置时拒绝自动抽取，避免把单个语言包误当成全站数据
