# 推荐技能包

> 目标读者：想按场景选择技能源的用户。推荐包不是新的分发格式，只是一组技能源的组合推荐；技能细节以各技能页或 `toolkit skills status` 为准。

## 推荐包是什么

推荐包把一组技能按场景预先组合，给出一条可复制的安装命令。它不改变技能本身的来源、版本与分发方式，安装、选择、状态与卸载仍由 `toolkit skills` 统一管理。

远程安装命令需要 `@fxri/toolkit >= 1.14.1`；更低版本只能安装本仓内置技能。

## 推荐技能源

### AI 协作工作流（本仓内置）

- **定位**：方案落盘、会话沉淀、发版 CHANGELOG、文本编码
- **适用**：使用 AI 协作开发的项目
- **安装**：

```bash
toolkit skills install --skills fxri-plan-to-task,fxri-session-recap,fxri-release-changelog,fxri-text-encoding
```

### 通用开发规范（playbook）

- **定位**：Web 前端、Vue、服务端、PHP、Java 的通用工程规范
- **适用**：前后端与全栈项目
- **安装**：

```bash
toolkit skills install --from https://github.com/fxri-net/playbook#v0.1.0 --skills fxri-dev-profile-web,fxri-dev-profile-vue,fxri-dev-profile-svc,fxri-dev-profile-php,fxri-dev-profile-java
```

### 个人协作偏好（playbook）

- **定位**：中文注释、先方案后动手、直奔主题等个人偏好
- **说明**：个人向，不建议团队统一安装
- **安装**：

```bash
toolkit skills install --from https://github.com/fxri-net/playbook#v0.1.0 --skills fxri-meta-preset-tqy
```

## 依赖会自动补全

技能 `metadata.requires` 声明的依赖会随选择自动安装。例如只选 `fxri-dev-profile-php`，会一并装入它依赖的 `fxri-dev-profile-svc`；不需要在命令里重复列出。

## 自定义组合

不套用推荐包时，用 `--skills` 自行拼装即可；也可以先用 `--mode package` 切到纯包管理器模式，再只选外部来源技能：

```bash
toolkit skills install --mode package --from https://github.com/fxri-net/playbook#v0.1.0 --skills fxri-dev-profile-web
```

## 安全提示

只安装可信来源。技能正文会被 agent 读取，来源内容等同可执行指令面；远程来源应优先使用 HTTPS 或 SSH，并用版本标签锁定，避免默认分支漂移。
