# 推荐技能包

> 目标读者：想按场景选择技能源的用户。推荐包不是新的分发格式，只是一组技能源的组合推荐；外部来源的技能清单与版本以来源仓自身的清单为准，本页不代抄。

## 推荐包是什么

推荐包把一组技能按场景预先组合，给出一条可复制的安装命令。它不改变技能本身的来源、版本与分发方式，安装、选择、状态与卸载仍由 `toolkit skills` 统一管理。

远程安装命令需要支持外部来源的 `@fxri/toolkit`（1.14.1+）；更低版本只能安装本仓内置技能。

## 推荐技能源

### AI 协作工作流（本仓内置）

- **定位**：方案落盘、会话沉淀、发版 CHANGELOG、文本编码
- **适用**：使用 AI 协作开发的项目
- **安装**：

```bash
toolkit skills install --skills fxri-plan-to-task,fxri-session-recap,fxri-plan-review,fxri-release-changelog,fxri-text-encoding
```

### 通用开发规范（playbook）

- **定位**：Web 与 Vue 的通用前端规范，通用原则与框架语法分层成技能
- **适用**：Web / Vue 前端项目
- **安装**：

```bash
toolkit skills install --from https://github.com/fxri-net/playbook
```

- **技能清单**：本页不固定列出。可用技能、依赖关系与版本一律以来源仓的 `skills.json` 与其文档站的档案页为准；不传 `--skills` 时进入交互选择，按提示挑选即可。
- **锁定版本**：生产使用建议在来源后追加发布标签（形如 `#vX.Y.Z`，以该仓 Releases 为准），避免默认分支漂移；标签号随来源仓发版变化，本页不代抄。

## 依赖会自动补全

技能 `metadata.requires` 声明的依赖会随选择自动安装，不需要在命令里重复列出；具体依赖以来源仓 `skills.json` 的 `requires` 字段为准。

## 自定义组合

不套用推荐包时，用 `--skills` 自行拼装即可；也可以先用 `--mode package` 切到纯包管理器模式，再只选外部来源技能：

```bash
toolkit skills install --mode package --from https://github.com/fxri-net/playbook --skills <技能名>
```

## 安全提示

只安装可信来源。技能正文会被 agent 读取，来源内容等同可执行指令面；远程来源应优先使用 HTTPS 或 SSH，并用版本标签锁定，避免默认分支漂移。

## 相关页面

- 参考：[安装方式](./getting-started#安装) · [AI 技能包](./guide#ai-技能包-skills) · [CLI 参考 · skills](./cli/skills)
