---
"@fxri/toolkit": patch
---

- 修复：技能远程来源的 git 调用改为参数数组直传，不再经 shell 拼接，Windows 上缓存目录含空格时不再克隆失败
