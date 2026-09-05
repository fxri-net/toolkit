---
"@fxri/toolkit": patch
---

- 文档：新增 Gitee 镜像渠道并推荐国内网络优先——README 顶部加 GitHub/Gitee 双入口（issues 反馈同双平台），FAQ 新增「国内网络优先走哪条渠道」（源码克隆、skills 走 Gitee 镜像本地源安装、CLI 走 npm 并给 npmmirror 提速、Gitee Issues 反馈），skills/README、新手指南与完整攻略补对应入口链接
- 文档：文档站「在 GitHub 上编辑此页」与站点规范地址（sitemap/og:image）支持按部署平台注入 `SITE_URL`/`REPO_URL` 环境变量——默认 GitHub，Gitee Pages / 私有 GitLab Pages 构建时各注入自己的仓库与域名（值由平台 CI/CD 变量提供，不进仓库源码）
