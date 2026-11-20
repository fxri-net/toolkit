---
title: scope（作用域）
---

# scope（作用域）

> 按项目 / 目录决定技能与规则是否生效。默认全域生效；只有写了 `activation` 配置才出现局部生效。本页命令只读，不写配置。

## 用途与场景

- 全局装了 CLI、技能与规则，但只想在指定项目 / 父目录生效，或排除某些项目 / 目录
- 排查「为什么这个目录生效 / 不生效」：看命中的配置文件与规则
- 团队自建项目层配置时，同样按就近覆盖参与判定

## 常用命令

```bash
toolkit scope                         # 交互菜单：看状态 / 设范围 / 管目录 / 内容闸门 / 批量挂载
toolkit scope status                  # 当前目录的判定与原因
toolkit scope status --format json    # 给 AI / 脚本消费
toolkit scope list                    # 规则、来源与优先级
toolkit scope add ~/work              # 加入白名单（只写全局配置）
toolkit scope remove ~/work/legacy    # 从规则中移除
toolkit scope mount ~/work --dry-run  # 批量项目面安装：先预览
toolkit scope guard fxri-plan-to-task # 内容闸门：按当前目录作用域输出技能正文（未激活退出码 3）
```

## 交互与批量挂载

- 无参 `toolkit scope` 在 TTY 下进入交互菜单；非 TTY 打印帮助
- 「设置生效范围」先选规则归属：全局（`~/.toolkitrc.json`）、当前项目（`.toolkitrc.json`，随仓库共享）、
  当前项目本机（`.toolkitrc.local.json`，不入库）；后两者只确认「本项目是否生效」，不扫描其他项目
- 全局归属下可扫描父目录（递归发现、依赖目录不进入）或手动输入路径，再选择加入白名单 / 黑名单 / 移出；
  同一路径已在另一侧时提供就地互转，写入前展示模式与两列表预览
- 扫描支持多父目录（逗号或换行分隔）与关键字过滤；0 结果时可选择下探更深、包含隐藏目录或嵌套仓库
- `scope add <dir>...` 无参进入同一流程；带参时为非交互追加白名单，遇到黑名单同路径自动互转并告警
- `scope add/remove` 只改配置文件（读 → 合并 → 原子写），具体层由交互选择；带参形式写全局层
- `scope mount` 会**向所选项目写入技能文件**，必须显式勾选并确认；`--dry-run` 只预览
- `scope mount` 仍只扫一层（`.git` / `package.json` / `.tasks`），不会因作用域扫描改为递归而扩大写入范围；
  作用域设置流程使用递归发现：命中 `.git` 即剪枝，依赖与产物目录不进入，默认跳过隐藏目录与嵌套仓库
- 「内容闸门」项显示当前开关（读 `skillsInstall.gate`），切换后可按已保存选择（无则 core）立即刷新产物，拒绝刷新则提示运行 `toolkit skills install`
- 非 TTY 环境：向导与 `mount` 会提示无法交互；`add` / `remove` 请直接带目录参数

## 内容闸门 guard

- 前置：已用 `toolkit skills install --gate` 或 `toolkit scope` 向导开启闸门；
  首批接入技能（`fxri-plan-to-task`、`fxri-session-recap`、`fxri-plan-review`）以入口壳分发
- `toolkit scope guard <技能名>` 读取当前目录的作用域判定：**激活时**把包内真实 `SKILL.md` 正文写到 stdout；**未激活时** stdout 为空、原因写 stderr 并以**退出码 3**结束
- 输出契约：stdout 只放正文（供 AI 直接消费），参考文件目录与诊断一律走 stderr；只读，不写缓存
- 技能名须为包内现存的单段名字；未知名字或含路径分隔符时以退出码 `1` 报错
- 仅在 argv 恰为 `scope guard <技能名>` 时走快速路径（不加载完整命令集）；带其它参数（含 `--help`）回落常规 CLI
- 入口壳只降低正文被读取的概率，不是物理隔离；需要绝对干净用 `scope mount` 或 `skills install --scope project` 做项目面安装
- `toolkit skills install --embed` 可随时回退为全文安装

## 判定顺序

1. `exclude` 路径规则命中 → 不生效（优先级最高；规则按判定基准匹配）
2. `markers.exclude` 标记存在 → 不生效
3. `markers.include` 已配置但一个都不存在 → 不生效
4. `gitRemotes` 已配置但远端未命中 → 不生效
5. `mode = allowlist`：未命中 `include` → 不生效；`mode = denylist` / `all`：生效

判定基准为项目根：优先 git 根，其次最近的 `.tasks` 根，都没有则回落当前目录；子目录内按项目根匹配。
`scope status --format json` 输出 `active` / `mode` / `baseDir` / `sourceFile` / `matchedRule` / `reason`；
基准变化导致新旧结论不同时，状态输出会在 stderr 给出提示。

## 边界

- 默认 `mode = all`，不配置时与历史行为完全一致
- 只影响技能与内容闸门（`scope guard`），不影响 `toolkit` 命令本身（命令是显式调用的）
- 全局规则无法按目录排除（agent 限制）；项目专用规则需落在项目内
- 工具不创建、不修改项目内配置或标记；项目层配置由用户自行写入时正常参与

## 相关页面

- 配置：[作用域（activation）](../config/activation) · [配置参考](../config)
- 参考：[CLI 参考](../cli) · [技能分发](./skills)
