# 操作手册

> 目标读者：任何想用起来的人——完全不熟命令的零基础用户、只用 AI 不想碰命令的用户、想自己手操 CLI 的用户。按「场景 → 该说什么/做什么 → 会发生什么」组织；每节末尾的「更多」指向对应文档。

## 一、首次使用

**目标**：装好工具 + skills，跑通一条任务闭环。

| 步骤 | 该做什么 | 会发生什么 |
| --- | --- | --- |
| 1 装 CLI | 团队项目：`pnpm add -D @fxri/toolkit`（npm 用 `npx`）；个人多项目：`pnpm i -g @fxri/toolkit` | 得到 `toolkit` 命令 |
| 2 装 skills | `toolkit skills install`（装了 CLI 一键分发，默认软链；npm 用户需先 `npm i -g @fxri/toolkit`）；也可用上游安装器 `pnpm dlx skills add fxri-net/toolkit --global` | AI 侧获得三份岗位说明书，遇到对应场景自动触发 |
| 3 建任务区 | `pnpm exec toolkit init` | 生成 `.tasks/active/{YYYYMM}/`、`archive/` 骨架与 `.gitignore` 片段 |
| 4 配全局规则（可选） | 从 [AI 全局规则](./ai-rules) 复制模板到你的 agent 全局 rules | AI 按你的纪律协作 |

三种安装方式对比、离线/内网装法见[新手指南 · 安装](./getting-started#安装)。

## 二、日常开发

**目标**：方案确认后，任务被记录、跟踪到归档。

> **触发靠语义，不靠背词**：fxri-* 能力是给 AI 的「岗位说明书」，按意图理解触发——你说意思即可（如「今天先到这」代表收尾、「上次做到哪了」代表恢复），不必记固定句式，不同说法都能触发。各能力完整触发描述见对应 SKILL.md 的 description 与「何时使用」节。

### AI 模式（推荐，日常零操作）

| 你该说 | 会发生什么 |
| --- | --- |
| 「把刚才确认的方案落盘为任务」 | AI 按 fxri-plan-to-task 在 `.tasks/active/` 建档（先查后写防重复） |
| （方案确认后）「按这个做吧 / 记一下」 | 同上，AI 识别为建档意图自动执行 |
| 任务做完 | AI 置终结态 → 归档 → 任务级规范沉淀 → 回报清单请你确认（提交/推送按你的规则决定） |
| 「现在有哪些没做完的任务」 | AI 跑总览给你 |

### 手操 CLI

```bash
pnpm exec toolkit tasks                 # 待完成总览
pnpm exec toolkit tasks check           # 校验 active（建错会告诉你错哪）
pnpm exec toolkit tasks archive --dry-run  # 归档预演，先看会归档什么
pnpm exec toolkit tasks archive         # 正式归档
pnpm exec toolkit tasks normalize       # 检查归档块（可 --fix 修复）
pnpm exec toolkit tasks stats           # 完成周期 / 滞留 / 吞吐统计
```

手工建档模板与 frontmatter 字段见[完整攻略 · 任务文件规范](./guide#任务文件规范)。

### 只写 AI 该怎么做

不需要懂任何命令：以上 CLI 动作 AI 都会按 skill 自动执行。你只需要在动手类任务前让 AI 先出方案、确认后再执行。

## 三、会话边界

**目标**：换会话不丢上下文；决策与理由沉进仓库。

| 场景 | 你该说 | 会发生什么 |
| --- | --- | --- |
| 会话收尾 | 「今天先到这 / 收个尾 / 把结论记下来」 | AI 全量回放本会话 → **任务清单先给你核对无遗漏** → 逐条落盘归档 → 规范沉淀进 conventions.md → 回报 |
| 新会话开始 | 「恢复上下文 / 上次做到哪了」 | AI 读 active 全部 + 近窗归档（≥1 年空洞旧档仅入索引），输出全部任务索引 + 进行中/搁置 + 规范现场 + 建议下一步 |
| 历史时间不准 | 「修正历史任务时间」 | AI 对照 git log/聊天记录取证 → 清单给你逐条确认 → 修正 → `normalize --fix` 迁移核验 |

时间取证的完整口径（四级时间源）见[完整攻略 · 会话沉淀、恢复与历史修正](./guide#会话沉淀恢复与历史修正)。

## 四、数据进出（报表 / 迁移）

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

## 五、发版

**目标**：变更集 → CHANGELOG → 发布，多语言分组标题不手翻。

```bash
pnpm exec toolkit changelog                  # 创建变更集（等价 changeset，选 patch/minor/major）
pnpm exec toolkit changelog version          # 消费变更集：升版本号 + 生成中文 CHANGELOG + 补发布日期
# 人工检查润色条目后：
pnpm exec toolkit changelog --lang en format # 其他语言格式化
# 提交 → 打 vX.Y.Z 标签 → 发布（按项目渠道，如 npm publish）
```

⚠️ 发版不是必经步骤：由你的规则约定是否执行；未归档的 active 任务存在时会提醒先归档。无 changesets 的项目走手工模式。完整链路见[完整攻略 · 多语言 CHANGELOG](./guide#多语言-changelog)。

## 六、升级与卸载

**目标**：CLI + skills + 全局规则对齐到最新；卸载时不留残渣。

### 升级

```bash
# 全局安装（推荐）
pnpm add -g @fxri/toolkit
toolkit skills status   # 可选：检查现场（悬空 / 指向错误 / 副本漂移 / 缺失 / 同名冲突）
                        # 前四类重跑 toolkit skills install 补齐，同名冲突需 toolkit skills install --force 覆盖

# 项目内（版本随仓库锁定）
pnpm up @fxri/toolkit
```

升级三步检查：

1. **CLI** 更新（上面命令）
2. **skills** 同步：默认**软链**直接指向包内真源，CLI 升级后技能即新版，无需额外命令；若是**副本**形式（`--copy` 安装，或链接创建失败自动降级），需重跑 `toolkit skills install` 刷新
3. **开新会话**：旧会话加载的技能内容还是旧版，新会话才读到新版

装 skills 后无需手动同步全局规则全文——规则细节已收敛进 skills。CLI 检测到新版本时会提示；关闭提示：`FX_NO_UPDATE_CHECK=1` 或配置 `updateCheck.enabled: false`。

### 卸载

```bash
toolkit skills remove            # 1. 先摘技能产物（只清本包装的，不碰你自己装的技能）
pnpm remove -g @fxri/toolkit     # 2. 再卸 CLI
```

⚠️ **顺序别反**：`skills remove` 依赖本工具（CLI + 包内真源）才能定位产物；先卸了 CLI，清技能就没工具可用——重装一次再执行 `toolkit skills remove` 即可。

⚠️ **软链会悬空**：软链形式的技能指向包内目录，CLI 一卸就成悬空链接（agent 读到空目录）。`toolkit skills remove` 会把悬空链接一并摘除；若已漏摘，手工删除 `~/.agents/skills/` 与各 agent 全局技能目录下的 `fxri-*` 链接。

## 七、隐私与安全

- 默认脱敏开启：终端展示、导出文件、归档落盘都会掩码敏感信息；`.tasks/active/` 源文件保持原样（设计如此）
- 不想某类信息被掩码、或要加自定义规则：`.toolkitrc.json` 的 `redact` 段（见[配置参考](./config#redact隐私脱敏)）

## 相关页面

- 30 秒快速上手 → [新手指南](./getting-started)
- 每个能力的原理与细节 → [完整攻略](./guide)
- 查命令参数 → [CLI 参考](./cli)
- 遇到问题 → [FAQ](./faq)
