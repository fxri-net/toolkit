---
owner: 唐启云
status: 待办
created: 20260905
updated: 20260905
completed: ''
depends_on: []
scope: ci
---

# GitLab Runner 启用（用户侧服务器操作）

## 背景

私有 GitLab 已有 .gitlab-ci.yml（test + pages 双 job），runner 未接入时 pipeline 停在 pending 属预期。本任务登记启用步骤备查；仓库零改动，全部为服务器/管理台操作。完整方案已在对话交付，此处存要点。

## 启用步骤（要点）

1. 服务器 Docker 安装 gitlab-runner（挂载 config 目录与 docker.sock，restart always）
2. 项目 Settings → CI/CD → Runners 新建 runner：勾选 protected 分支 + untagged（CI 未用 tags、jobs 限定默认分支），用 glrt- token 注册，executor=docker、image=node:20、pull_policy=if-not-present
3. 国内提速：CI/CD 变量加 COREPACK_NPM_REGISTRY 指向 npmmirror；Docker daemon 可配镜像加速
4. 启用 GitLab Pages（管理员一次性）：泛解析 + 泛域名证书 + gitlab.rb 配置 pages_external_url 与 gitlab_pages["enable"] 后 reconfigure；站点路径与 CI 中 VITEPRESS_BASE=/toolkit/ 匹配，CI 文件无需改
5. CI/CD 变量注入 SITE_URL（pages 站点地址）与 REPO_URL（私有仓库回链），值不进仓库
6. 验证：push 默认分支 → test job 全链检查 + pages job 部署；站点按 /toolkit/ base 正常打开

## 注意事项

- 自托管 Pages 默认公开可访问；要限制为成员可见需 gitlab.rb 开 access_control
- 本任务为用户侧操作，AI 侧无可执行项；用户完成注册后 pipeline 自动生效，Pages 配置完成后站点生效
