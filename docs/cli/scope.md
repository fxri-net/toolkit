---
title: scope（作用域）
---

# scope（作用域）

> 按项目 / 目录决定技能与规则是否生效。默认全域生效，只有写了 `activation` 配置才出现局部生效。
> `status` / `list` 只读，`add` / `remove` 按命令写配置；批量挂载已迁至 `toolkit skills mount`。

## 用途与场景

- 全局装了 CLI、技能与规则，但只想在指定项目 / 父目录生效，或排除某些项目 / 目录
- 排查「为什么这个目录生效 / 不生效」：看命中的配置文件与规则
- 团队自建项目层配置时，同样按就近覆盖参与判定

## 常用命令

```bash
toolkit scope                         # 状态优先向导：看状态 / 加白黑名单 / 管条目 / 默认值 / 高级规则
toolkit scope wizard                  # 显式进入交互向导（非 TTY 退出码 2）
toolkit scope status                  # 当前目录的判定与原因
toolkit scope status --skill fxri-plan-review # 按技能级规则判定单个技能
toolkit scope status --format json    # 给 AI / 脚本消费
toolkit scope list                    # 规则、来源与优先级
toolkit scope add ~/work              # 加入白名单，默认切到「仅名单内生效」
toolkit scope exclude ~/work/legacy   # 加入黑名单，默认值不变
toolkit scope add ~/work --layer project # 写入当前项目层（随仓库共享）
toolkit scope remove ~/work --from include --to exclude # 白名单转黑名单
toolkit scope remove ~/work/legacy --from exclude       # 从黑名单移除
toolkit scope default                 # 查看当前默认值
toolkit scope default off             # 切换为「仅名单内生效」
toolkit scope reset                   # 清除限制（全部生效）
toolkit skills mount ~/work --dry-run  # 批量项目面安装：先预览（由 scope mount 迁入）
toolkit scope guard fxri-plan-to-task # 内容闸门：按当前目录作用域输出技能正文（未激活退出码 3）
```

## 交互与写命令

- 无参 `toolkit scope`：TTY 下进入状态优先向导；非 TTY 输出状态摘要与子命令提示并以 `0` 退出。
  交互入口也可显式运行 `toolkit scope wizard`（非 TTY 退出码 `2`）
- `scope status` / `list` 的 `--format` 仅接受 `json`，非法值在 stderr 报错并以 `1` 退出，不再回落文本
- 向导首页固定显示「当前层 + 配置文件 + 默认值 + 白名单 / 黑名单条数」；首项为查看状态 / 规则清单，避免盲改
- 动作按意图排列：添加白名单 / 添加黑名单 / 管理条目（移除、互转）/ 切换默认值 / 清除限制 / 高级规则 / 切换配置层 / 退出
- 添加流程先选白或黑，再选来源：扫描项目选择、手动输入目录、使用当前目录；扫描结果页显示跳过统计，
  可切换包含隐藏目录 / 嵌套仓库或下探更深
- 项目层 / 本地层额外提供「仅本项目生效」「在本项目内排除」两个快捷项，落到同一配置模型，不再走独立分支
- 管理条目合并两列表并标注 `[白]` / `[黑]`、路径存在性与被覆盖提示；勾选后移出或转到另一侧，写前展示 diff
- 高级规则（启用标记 / git 远端 / 技能级规则）只读展示并给出配置文件路径，复制后自行编辑，不自造低频编辑 UI
- 内容闸门与批量挂载已移出本域：闸门用 `toolkit skills gate on|off` 切换，
  `toolkit skills install --gate` / `--embed` 生成或还原入口壳；批量挂载用 `toolkit skills mount`
- 选择页统一提供「← 返回」（末位）与 ESC 返回上一级；顶层「退出」按成功计 `0`，Ctrl+C 结束整个命令（退出码 `130`）
- ESC 有约 500ms 判定延迟（readline 需先排除方向键序列），属正常现象
- `add` / `exclude` / `remove` 均需显式目录：无参只提示改用 `toolkit scope wizard`，不再隐式进入完整向导
- `add` 加入白名单并把默认值切到「仅名单内生效」；`exclude` 只加黑名单、默认值不变；同路径在另一侧时写前预览「移入 / 转入」
- `remove --from include|exclude|both`（默认 `both`）指定来源侧，`--to include|exclude` 一步转入另一侧；带参与交互同口径
- `default on|off` 查看或切换默认值；`reset` 清除限制（全部生效并清空两列表，保留标记 / git 远端 / 技能级规则）
- 写前统一展示预览：TTY 下确认后落盘，`--yes` 跳过确认，`--dry-run` 只预览；非 TTY 带显式参数直接执行
- 结果块统一输出写入文件、变更条目与当前默认值；无变化时只提示「没有变化，无需写入」
- 相对路径按目标层项目根解析（全局层按当前目录）；`--layer global|project|local` 缺省全局
- `scope list` 同时输出条目存在性：文本模式列出「条目异常」，`--format json` 的 `items` 含 `path` / `list` / `exists`；
  相对路径条目按所属配置层的项目根解析
- 批量项目面安装已迁至 `toolkit skills mount`（原 `scope mount` 已移除）；写入边界与 `--dry-run` 见 [skills 命令 · mount](./skills#mount)
- 非 TTY 环境：`wizard` 会提示无法交互（退出码 `2`）；写命令请直接带参数

## 内容闸门 guard

- 前置：已用 `toolkit skills gate on` 或 `toolkit skills install --gate` 开启闸门；
  接管范围默认全部技能，可用 `skillsInstall.gate.include` / `exclude` 裁剪，技能也可用 `metadata.gate: false` 退出
- `toolkit scope guard <技能名>` 读取当前目录的作用域判定：**激活时**把真源 `SKILL.md` 正文写到 stdout；**未激活时** stdout 为空、原因写 stderr 并以**退出码 3**结束
- 输出契约：stdout 只放正文（供 AI 直接消费），参考文件目录与诊断一律走 stderr；只读，不写缓存
- 技能名须为内置包或已登记来源中存在的单段名字；未知名字或含路径分隔符时以退出码 `1` 报错
- 仅在 argv 恰为 `scope guard <技能名>` 时走快速路径（不加载完整命令集）；带其它参数（含 `--help`）回落常规 CLI
- 入口壳只降低正文被读取的概率，不是物理隔离；需要绝对干净用 `skills mount` 或 `skills install --scope project` 做项目面安装
- `toolkit skills install --embed` 可随时回退为全文安装

## 判定顺序

1. `exclude` 路径规则命中 → 不生效（优先级最高；规则按判定基准匹配）
2. `markers.exclude` 标记存在 → 不生效
3. `markers.include` 已配置但一个都不存在 → 不生效
4. `gitRemotes` 已配置但远端未命中 → 不生效
5. `mode = allowlist`：未命中 `include` → 不生效；`mode = denylist` / `all`：生效

判定基准为项目根：优先 git 根，其次最近的 `.tasks` 根，都没有则回落当前目录；子目录内按项目根匹配。
`scope status --format json` 输出 `active` / `mode` / `baseDir` / `skill` / `sourceFile` / `matchedRule` / `reason`；
基准变化导致新旧结论不同时，状态输出会在 stderr 给出提示；规则若按真实路径（如 macOS `/private/...`）
写入而不再命中，同样提示改用 `pwd` 看到的路径。
`scope status --skill <name>` 应用 `activation.skills` 的技能级规则，`matchedRule` 以 `skill:<键>:` 前缀标明来源。

## 边界

- 默认 `mode = all`，不配置时与历史行为完全一致；`denylist` 是等价的兼容别名，`status` / `list` 显示为 `all（兼容读取 denylist）`，
  任何写命令都会把旧值归一为 `all`
- `mode = all` 时 `include` 不参与判定，`list` 会在白名单后标注「当前默认全部生效，未参与判定」
- 只影响技能与内容闸门（`scope guard`），不影响 `toolkit` 命令本身（命令是显式调用的）
- 全局规则无法按目录排除（agent 限制）；项目专用规则需落在项目内
- 工具不创建、不修改项目内配置或标记；项目层配置由用户自行写入时正常参与

## 相关页面

- 配置：[作用域（activation）](../config/activation) · [配置参考](../config)
- 参考：[CLI 参考](../cli) · [技能分发](./skills)
