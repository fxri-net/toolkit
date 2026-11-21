# 技能自查清单

> 由 `../SKILL.md` 按需加载。可机械检出的项目以 `toolkit skills lint` 的输出为准，本清单只用于写作与评审时逐项确认。

## 一、触发面

- [ ] `description` 写清「何时加载」与「不用于什么」，能被与任务无关的读者一次判断。
- [ ] 触发词覆盖真实说法（含口语近义），不依赖某个特定 agent 的提示词。
- [ ] 不把多个互不相关的任务塞进同一个技能；确需合并时在入口写清分诊顺序。

## 二、结构

- [ ] 目录为小写 kebab 且带团队前缀，`SKILL.md` 位于技能根。
- [ ] `name` 与目录名一致。
- [ ] 入口按「何时使用 → 工作流 → 不做 → 参考」组织，读者从上到下即可执行。
- [ ] 入口只放判断与最短步骤；长表格、平台差异、示例库已下沉到 references 目录。
- [ ] 拆出的 references 在入口或同技能文档内被引用，引用为相对路径。

## 三、frontmatter 与版本

- [ ] 必填字段齐全：`name` / `description` / `license` / `metadata.version` / `metadata.tier` /
      `metadata.author` / `metadata.source`。
- [ ] `metadata.tier` 使用既有取值，不新造层级。
- [ ] 正文首部存在「本技能版本」，且与 `metadata.version` 一致。
- [ ] 内容变更后用 `toolkit skills bump` 递增，两处同时更新；内容未变不递增。
- [ ] 两处版本不一致时先跑 `toolkit skills lint`，需要指定源头时用 `--from frontmatter|body`。

## 四、安全与边界

- [ ] 不含私钥、令牌或任何真实凭据。
- [ ] 不含机器绝对路径、本机用户名或内网地址；示例使用占位符。
- [ ] 不复制其他仓库的规范条文；跨仓共享时把规范放在 toolkit，其他仓只加载或调用命令。
- [ ] 产品仓不维护技能规范副本，门禁只调用 toolkit 命令。

## 五、收尾

- [ ] `toolkit skills lint skills/` 无错误；告警逐项确认是否需要处理。
- [ ] 技能表与文档索引已同步版本、层级与用途。
- [ ] 新技能或对外行为变化已补 patch 变更集。
