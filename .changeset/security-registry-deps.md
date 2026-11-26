---
"@fxri/toolkit": patch
---

- 修复：升级检查的 registry 只接受 https，项目 `.npmrc` 与项目层配置不再获得查询凭据
- 修复：升级查询不跟随重定向，避免带凭据的请求被引到其他主机
- 优化：抬高 `tmp` / `brace-expansion` / `uuid` 传递依赖版本，生产依赖无已知漏洞
