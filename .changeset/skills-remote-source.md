---
"@fxri/toolkit": patch
---

- 新增：`skills install --from` 支持 Git 远程地址与 `#ref`，本地与远程共用一套来源解析
- 新增：远程来源浅克隆到用户级缓存，项目面状态只记地址与 ref，不写本机缓存路径
- 优化：临时 `--from` 来源不写选择集与来源配置
