---
title: init（项目初始化）
---

# init（项目初始化）

> 在新项目里一次性搭好任务区、规范载体与技能入口。

```bash
toolkit init
toolkit init --dir ../my-tasks-repo   # 任务区放项目外（独立仓库管理）
toolkit init --no-hooks               # 不写入 package.json 的 prepare 刷新钩子
```

在当前目录初始化任务区，逐项如实报告实际动作（新建 / 更新 / 保持 / 追加 / 跳过）：

- 创建 `<任务目录>/active/{YYYYMM}/` 与 `<任务目录>/archive/` 目录骨架
  - 默认目录 `.tasks`；优先级与 `tasks` 同口径：CLI 参数 > 配置 `tasks.dir` > 默认 `.tasks`
- 创建规范载体骨架 `<任务目录>/conventions/index.md`（v3 三节：端清单 / 索引 / 用法说明）与 `history.md`（语义演进记录）
  - `index.md` 已存在时保持不动；v1 / v2 形态另给升级提示
  - 存在待迁移的旧单文件 `<任务目录>/conventions.md` 时不建空骨架
- 在**已存在的**项目级技能目录各生成一份规范入口壳（如 `.agents/skills/toolkit-conventions/SKILL.md`，目录名与 frontmatter `name` 同名）
  - 壳只作入口、不承载条文；多 agent 混用团队多个候选目录并存时每处各写一份、互不覆盖
  - 一个候选目录都不存在时回落 `.agents/skills/`，不为未安装的 agent 凭空建目录
  - 壳已存在时按标记版本分流：标记不旧于当前版本保持不变，落后或无标记就地更新为当前版本（报告为「更新」）
  - 另在**已存在的** `AGENTS.md` 内幂等追加规范入口指针块；`AGENTS.md` 不存在时不新建，仅在报告中提示规范仍可经全局技能触达
- 向 `.gitignore` 追加忽略片段（含 `.archive.lock` 与 `.toolkitrc.local.json`）
  - 片段头另附一行出口指引注释：不想改团队 `.gitignore` 者，可把忽略行写进 `.git/info/exclude`
  - **逐行幂等**：「是否已覆盖」用 `git check-ignore` **真实判定**，已有该行则跳过；手删单行后重跑只补该行
  - 判定涵盖本仓库与上层 `.gitignore`、`.git/info/exclude` 等全部来源，能识破 `*.lock`、`*.local.json` 等手写通配写法
  - 非 git 仓库或 git 不可用时退回等价写法白名单：精确行 `/.toolkitrc.local.json` 的带 / 不带前导 `/` 两种写法，及通配 `*.local.json`、`.toolkitrc.*`
  - 白名单外一律追加，宁冗余不误跳
- 向 `.prettierignore` 幂等追加任务区排除行（`<任务目录>/`），让格式化器不碰任务区
  - 原因：任务区表格进入 prettier 范围会被填充出列对齐空白，Markdown 预览不显示、源码可读性变差、token 成本上升
  - **触发条件缺一不写**：任务区落在仓库内且非仓库根、非本包源仓库、宿主疑似使用 prettier
  - prettier 迹象的判据（任一）：已存在 `.prettierignore`、存在 prettier 配置文件、`package.json` 声明 prettier 依赖或含 `prettier` 键
  - 已有等价排除行（如 `/.tasks`）保持不动（报告为「保持」）；未见 prettier 迹象时跳过，并提示「项目启用 prettier 后重跑 `toolkit init` 会自动补上该排除行」
  - prettier 的 `--ignore-path` 默认同时读 `.gitignore` 与 `.prettierignore`，故新建此文件不影响既有忽略语义
- 向 `package.json` 幂等补一行 `prepare` 钩子（值为 `toolkit skills install --scope project`），供依赖升级后自动刷新项目面技能
  - 仅当本地依赖含 `@fxri/toolkit` 时写入：`dependencies` / `devDependencies` / `peerDependencies` / `optionalDependencies` 任一
  - 写入采用最小文本插入，保留原有排版
  - 已有等价钩子（裸 `toolkit skills install` 亦可）保持不变；已有非等价 `prepare` 跳过并提示不覆盖
  - 未声明本地依赖、`package.json` 缺失或解析失败均跳过并说明；本包源仓库跳过；`--no-hooks` 关闭写入
- ⚠️ 发布型包误打包检查**独立于钩子**：`package.json` 未标 `private` 且无 `files` 白名单时，报告附提示
  - 与钩子是否写入无关：`--no-hooks`、未声明本地依赖、非等价 `prepare` 等情形同样提示
  - 原因：`npm` 无 `.npmignore` 时退回 `.gitignore` 决定打包面，而项目面技能产物与内置任务区都不在忽略列表、会被打进包
  - 涉及产物：技能真源 `.agents/skills/`、各候选目录下的入口薄壳、归属账 `.toolkit/`，以及内置任务区 `.tasks/`（任务区外置时不计入）
  - 处置：发布型包请把它们加入 `files` 白名单或 `.npmignore`；`init` 只提示、不代改
- 输出后续步骤与文档站链接；检测到尚未安装全局技能时，后续步骤中补一行 `toolkit skills install` 指引（规范触达第一层，不依赖项目内文件；已安装则不重复提示）

⚠️ 入口壳写入项目级技能目录（`.agents/skills/`、`.trae/skills/` 等）属**侵入性行为**。`init` 在报告中逐项列出实际写入的路径与动作（存在几个候选目录就各写一份）。

落点被 `.gitignore` 覆盖时报告给出否定规则提示（**不代改 `.gitignore`**）。入口壳可安全删除，重跑 `init` 会补回；标记落后于当前版本时就地更新为当前版本。

⚠️ 重复执行安全：业务文件已存在一律保持不覆盖、不报错（逐项报告为「保持」）；唯一例外是**入口壳按标记版本分流**——标记不旧于当前版本时保持不变，标记落后或无标记时就地更新为当前版本（报告为「更新」）。

⚠️ 任务区放项目外（独立文档仓库）：配置 `"tasks": { "dir": "../my-tasks-repo" }` 后，`init` 与全部 `tasks` 子命令都作用于该目录，一次配置永久生效。

`.gitignore` 片段仍写入当前项目。

## 相关页面

- 参考：[快速开始 · 30 秒上手](../getting-started#_30-秒上手) · [技能分发](./skills)
