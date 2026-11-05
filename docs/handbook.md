# 操作手册

> 目标读者：任何想用起来的人——完全不熟命令的零基础用户、只用 AI 不想碰命令的用户、想自己手操 CLI 的用户。按「场景 → 该说什么/做什么 → 会发生什么」组织；每节末尾的「更多」指向对应文档。
>
> 本篇只讲**怎么用**：每个场景说什么、做什么、会发生什么；机制原理、边界与细节取舍见[完整攻略](./guide)。

## 一、首次使用

**目标**：装好工具 + skills，跑通一条任务闭环。命令细节与三种安装方式对比见[新手指南 · 安装](./getting-started#安装)。

| 步骤 | 该做什么 |
| --- | --- |
| 1 装 CLI | 团队项目 `pnpm add -D @fxri/toolkit`；个人多项目 `pnpm i -g @fxri/toolkit` |
| 2 装 skills | `toolkit skills install`；项目面用 `--scope project`（技能随仓库入库、队友 clone 即用） |
| 3 建任务区 | `pnpm exec toolkit init` |
| 4 配全局规则（可选） | 从 [AI 全局规则](./ai-rules) 复制模板；提交习惯另取[提交信息规则](./commit-rules) |

初始化做了什么、30 秒最短路径见[新手指南 · 30 秒上手](./getting-started#_30-秒上手)。

## 二、日常开发

**目标**：方案确认后，任务被记录、跟踪到归档。

> **触发靠语义，不靠背词**：fxri-* 能力是给 AI 的「岗位说明书」，按意图理解触发——你说意思即可（如「今天先到这」代表收尾、「上次做到哪了」代表恢复），不必记固定句式。各能力完整触发描述见对应 SKILL.md 的 description 与「何时使用」节。

| 你该说 | 会发生什么 |
| --- | --- |
| 「把刚才确认的方案落盘为任务」 | AI 按 fxri-plan-to-task 在 `.tasks/active/` 建档（先查后写防重复） |
| （方案确认后）「按这个做吧 / 记一下」 | 同上，AI 识别为建档意图自动执行 |
| 方案涉及多个任务或多个仓库 | AI 先出一张纯展示计划表（仓库 + 任务 + 前置，跨仓同表），再逐仓逐任务建档，按表顺序逐个交付、逐个提交 |
| 任务做完 | AI 置终结态 → 归档 → 任务级规范沉淀 → 回报清单请你确认 |
| 「现在有哪些没做完的任务」 | AI 跑总览给你 |

想自己手操命令时，归档、校验、归一、统计、导入导出等命令见 [tasks 命令](./cli/tasks)；手工建档模板与 frontmatter 字段见[完整攻略 · 任务文件规范](./guide#任务文件规范)。只写 AI 该怎么做：不需要懂命令，以上动作 AI 都会按 skill 自动执行，你只需在动手类任务前让 AI 先出方案、确认后再执行。

## 三、会话边界

**目标**：换会话不丢上下文；决策与理由沉进仓库。

| 场景 | 你该说 | 会发生什么 |
| --- | --- | --- |
| 会话收尾 | 「今天先到这 / 收个尾 / 把结论记下来」 | AI 全量回放本会话 → **任务清单先给你核对无遗漏** → 逐条落盘归档 → 规范沉淀进 conventions 载体 → 回报 |
| 新会话开始 | 「恢复上下文 / 上次做到哪了」 | AI 读 active 全部 + 近窗归档（≥1 年空洞旧档仅入索引），输出全部任务索引 + 进行中/搁置 + 规范现场 + 建议下一步 |
| 历史时间不准 | 「修正历史任务时间」 | AI 对照 git log/聊天记录取证 → 清单给你逐条确认 → 修正 → `normalize --fix` 迁移核验 |

⚠️ **跨仓库会话**：一次会话涉及多个仓库时，各仓的改动在各自仓库里建档归档（任务档是仓库自述，只记本仓的改动与动机），不把另一仓的工作痕迹合并进本仓记录。

时间取证的完整口径（四级时间源）见[完整攻略 · 会话沉淀、恢复与历史修正](./guide#会话沉淀、恢复与历史修正)。

## 四、规范载体迁移

**目标**：把项目里旧的单文件 `.tasks/conventions.md` 升到 `conventions/` 目录形态（`index.md` 唯一入口 + `common.md` / 各端分册按需创建），让规范能按端分类、按需加载；已有目录形态但结构为旧版的载体升到 **v3 三分区**。

| 场景 | 你该说 | 会发生什么 |
| --- | --- | --- |
| 形态迁移（单文件 → 目录） | 「把项目里的 conventions.md 迁到新形态」 | AI 走三段式：建 `conventions/` 并把旧文件**整体**搬为 `index.md`（原文不丢）→ 逐条给出「`common` / 某端」归属建议 → 你逐条确认后拆成索引行 + 分册 |
| 结构升级（v1 / v2 → v3） | 「把规范载体升到 v3」 | 载体升到 v3（三分区：常驻索引 / 按需分册 / 归档留痕；首行形态标记、索引表首列为稳定 ID `C-<n>`、索引表删「状态」「确立来源任务」两列、`history.md` 表头首格同为稳定 ID `ID`）：优先 `pnpm exec toolkit conventions upgrade`（`--dry-run` 预演、幂等、先判后写，异常形态拒绝写盘），亦可按链路手工执行 |
| 只修订内容（不换形态） | 「第 3 条规范改成 …」 | 语义变更：AI 在 `history.md` 追加留痕（只追加、不改旧行）→ 更新 `index.md` 该行「当前语义」；规则**作废**走「迁出 + 三层清理」——索引行从 `index.md` **删除**并迁入 `retired.md`（冻结退休时语义、记后继与条文去向），同时**物理删除**分册内该条小节、同步删改外部单一事实源 |

- **入口**：`toolkit tasks check` 报旧单文件存在 / 缺 `index.md` / 形态异常时按提示处理；`toolkit conventions status` 查载体现场；新项目 `toolkit init` 已预生成骨架
- **端名与读法**：端名与任务 `scope` 逐字一致（`web+server` → `web.md` + `server.md`），端清单以 `index.md` 顶部声明为唯一权威；迁移期间新旧兼容读，两者并存以目录形态为准；表格被格式化器填充出空隙时用 `toolkit conventions format` 归一

三分区、读写分层与表格形态的机制见[完整攻略 · conventions/](./guide#conventions-规范沉淀地)，命令契约见 [conventions 命令](./cli/conventions)。

## 五、数据进出（报表 / 迁移）

**目标**：任务数据与 Excel/CSV/JSON 互转，方便汇报或从旧系统迁入。

```bash
# 导出：按扩展名自动识别格式（.csv 带 BOM，Excel 直开；.xlsx 三 sheet；.json 结构化）
pnpm exec toolkit tasks --view archived --export 归档报表.xlsx

# 导入：先预演核对，再正式导入
pnpm exec toolkit tasks --import 需求清单.csv --dry-run
pnpm exec toolkit tasks --import 需求清单.csv --target active
```

- 表头写常见叫法即可（「任务名/负责人/状态/截止日期」），中英文别名自动识别
- 落盘自动脱敏：手机号、邮箱、密钥等掩码后再写归档
- 列名映射定制、脱敏规则见[配置参考](./config)

## 六、发版

**目标**：变更集 → CHANGELOG → 发布，多语言分组标题不手翻。

```bash
pnpm exec toolkit changelog            # 创建变更集（等价 changeset，选 patch/minor/major）
pnpm exec toolkit changelog version    # 消费变更集：升版本号 + 中文 CHANGELOG + 发布日期
pnpm exec toolkit changelog doc        # 同步文档站更新日志镜像（version 后也会自动同步）
# 提交 → 打 vX.Y.Z 标签 → 发布（按项目渠道，如 npm publish）
```

⚠️ 发版不是必经步骤：默认由你的规则约定是否执行，当次指令已含授权则直接执行；未归档的 active 任务存在时会提醒先归档。完整链路见[完整攻略 · 多语言 CHANGELOG](./guide#多语言-changelog)，参数见 [changelog 命令](./cli/changelog)。

## 七、升级与卸载

**目标**：CLI + skills + 全局规则对齐到最新；卸载时不留残渣。

### 升级

```bash
pnpm add -g @fxri/toolkit   # 全局安装（推荐）
pnpm up @fxri/toolkit       # 项目内（版本随仓库锁定）
toolkit skills status       # 查 CLI 版本提示与技能现场
```

升级三步检查：

1. **CLI** 更新
2. **skills** 同步：软链形式随 CLI 自动更新；副本形式（`--copy` 或建链失败降级）需重跑 `toolkit skills install`；项目面由 `prepare` 钩子自动刷新
3. **开新会话**：旧会话加载的仍是旧版技能

⚠️ 软链落点是**写入穿透**形态：编辑落点文件等于编辑真源，要改技能内容请改真源（`toolkit skills status` 报告末尾也会提示）。

⚠️ **历史落点残留**：Codex / Pi 的全局落点已改为 canonical（`~/.agents/skills/`），升级前分发到 `~/.codex/skills/`、`~/.pi/agent/skills/` 的产物不再随本包更新；若状态文件仍有登记且目录仍在，`status` 会单列提示，用 `toolkit skills remove` 清理后再 `toolkit skills install` 恢复（只提示、不自动删除）。

规则细节已收敛进 skills，装完无需手动同步全局规则全文。CLI 检测到新版本会提示；关闭提示：`FX_NO_UPDATE_CHECK=1` 或配置 `updateCheck.enabled: false`。版本兼容（Node 版本要求）见[完整攻略 · 升级与版本兼容](./guide#升级与版本兼容)。

### 卸载

```bash
toolkit skills remove            # 1. 先摘技能产物（只清本包装的，不碰你自己装的技能）
pnpm remove -g @fxri/toolkit     # 2. 再卸 CLI
```

⚠️ **顺序别反**：`skills remove` 依赖本工具（CLI + 包内真源）才能定位产物；先卸了 CLI，清技能就没工具可用——重装一次再执行 `toolkit skills remove` 即可。

⚠️ **软链会悬空**：软链形式的技能指向包内目录，CLI 一卸就成悬空链接（agent 读到空目录）。`toolkit skills remove` 会把悬空链接一并摘除；若已漏摘，手工删除 `~/.agents/skills/` 与各 agent 全局技能目录下的 `fxri-*` 链接。

## 八、隐私与安全

- 默认脱敏开启：终端展示、导出文件、归档落盘都会掩码敏感信息；`.tasks/active/` 源文件保持原样（设计如此）
- 不想某类信息被掩码、或要加自定义规则：`.toolkitrc.json` 的 `redact` 段（见[配置参考 · redact](./config/redact)）

## 相关页面

- 参考：[新手指南](./getting-started) · [CLI 参考](./cli) · [FAQ](./faq)
