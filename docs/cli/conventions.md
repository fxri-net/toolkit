---
title: conventions（规范载体）
---

# conventions（规范载体）

> 规范载体的结构升级、表格归一与只读体检。

```bash
toolkit conventions upgrade               # 把 v1 / v2 规范载体升级为 v3（幂等，先判后写）
toolkit conventions upgrade --dry-run     # 预演：只预览将执行的动作，不写文件
toolkit conventions upgrade --format json # JSON 输出：ID 映射、内部引用改写、结构动作清单
toolkit conventions status                # 只读体检：形态 / 索引 / 入口层三块（只报不改，体检不阻断、退出码恒 0；仅 --format 传非法值时按参数错误退出）
toolkit conventions status --format json  # JSON 输出：形态、条目数、入口壳现场与逐条体检项
toolkit conventions status --dir ./repo/.tasks # 跨仓体检：入口壳与检测入口按该目录所属仓库扫描（父目录含 package.json / .git 即视为仓库根；tasks check --dir 同口径）
toolkit conventions format                # 归一任务区表格形态：把列对齐填充压回紧凑形态（幂等；兜底 prettier 等格式化器造成的填充）
toolkit conventions format --dry-run      # 预演：只报告将改动的文件与行数，不写文件
toolkit conventions format --format json  # JSON 输出：status、目录、文件数、变更文件数与逐文件变更行号
```

裸 `toolkit conventions` 打印本域帮助（列出 3 个子命令）。

| 子命令 | 行为 |
| --- | --- |
| `upgrade` | 把 v1 / v2 载体升为 **v3 三分区**：v1 输入先升 v2 再升 v3（首行补形态标记、标题归一、「演进记录」节抽为独立 `history.md`、索引表首列 `#` → `ID`、内部引用改写为稳定 ID `C-<n>`）；v2 → v3 再删索引表「状态」「确立来源任务」两列、`history.md` 表头首格归一为稳定 ID `ID`（与索引表首列同归一）、把状态为 `已废弃` 的行迁入按需创建的 `retired.md`（并从 Z1 索引删除、同步物理删分册内对应小节）、`history.md` 首列补 `C-<n>` 与来源列补录（首列已为行内代码包裹的 `C-<n>` 不误报）、`index.md` 表外自由文本残留 v2 措辞（「确立来源任务」「状态改为已废弃」等）复核、首行标记升 v3。以上无法机械判定的项列为人工复核项 `reviews`（只报不改）。**幂等**——已是 v3 返回 `already-v3`、不改动；未初始化（缺 `index.md`）或形态异常（标记 / `history.md` / 索引表首列三者不一致）在**写盘前**拒绝执行并给非 0 退出码，不写任何文件。`--dry-run` 只报告不改动；`--format json` 输出 `status`、`idMap`、`refs`、`changes`、`reviews`（ID 映射只随报告输出、不落盘） |
| `status` | 只读体检、只报不修（无 `--fix`）：**形态**（v1 / v2 提示可升级、形态异常、旧单文件与目录并存、**表格存在列对齐填充可执行 `toolkit conventions format` 归一**、v3 载体索引表列集合须恰为 `ID | 规则 | 当前语义 | 归属 | 单一事实源` 五列或 `history.md` / `retired.md` 表头须整行逐格一致（列名与次序偏离时提示人工归一）、载体各文件表头行与紧随分隔行列数须相等（跳过 fenced code block）、v3 载体 `history.md` 数据行首列非稳定 ID 时提示人工补录（只报不改）、v3 载体分册（`index.md` 除外）内残留行首「确立来源」子项时提示人工归一（来源由索引行与 `history.md` 承载，跳过 fenced code block、只报不改）、v3 载体 `history.md` 数据行「修订内容」列含禁用语料（自指套话如「（本次起入表）」「新立条目：」，或重复索引列的条文去向如「条文全文落 X」）时提示人工归一（只报不改））、**索引**（ID 形态与重复、归属不在端清单内、分册小节在索引表无对应条目、分类标签分册识别、`common` 条目语义含端限定语（仅 / 只 / 专属 / 适用于）并提及端名时的下沉提示（大小写不敏感）、`retired.md` 存在时表头校验）、**入口层**（壳标记与当前 toolkit 不一致、壳被 gitignore 覆盖，多落点并存时各合并为一条并内联全部落点路径；标记不一致可重跑 `toolkit init` 就地更新为当前版本；无壳仅提示，本包源仓库除外——其不生成入口壳）三块，逐条按 `[形态]` / `[索引]` / `[入口层]` 前缀输出；一句话结论为 `载体 <形态>，<n> 条规范，入口壳 <m> 个，无待处理项 / <k> 项待处理`；未初始化只回单条结论。**体检不阻断、退出码恒 0**（异常不阻断，便于当 CI 信息源；仅 `--format` 传非法值时按参数错误报错退出）；另输出 `checkCoverage`（`covered` / `uncovered` / `unknownIds`），一句话结论追加「其中 N 条无检测入口」 |
| `format` | 归一任务区表格形态：把被格式化器填充的列对齐空白压回紧凑形态（单元格间单空格），分隔行按列宽补长的横线一并压为 `---`（保留对齐标记）。范围＝任务目录下**全部** `.md`（载体三件 + active + archive），**跳过 fenced code block**（```` ``` ```` 与 `~~~` 块内的表格样例原样保留）；只动单元格间距、分隔行横线长度与列对齐填充，单元格文本、分隔行对齐标记（`:---` / `---:` / `:---:`）与行尾符（CRLF/LF）一律保留。**幂等**——已是紧凑形态返回 `already-compact`、不改动；未初始化（任务目录不存在）在**写盘前**报错并以非 0 退出码终止。`--dry-run` 只报告不改动；`--format json` 输出 `status`、`tasksDir`、`files`、`changedFiles`、`changedLines`、`changes`（逐文件变更行号） |

⚠️ `upgrade` 只做机械结构升级，不改条文语义；升级过程可中断、重复执行安全。

⚠️ `format` 只动空白层与分隔行横线长度、不改语义（紧凑是规范形态、填充是偏离）；`tasks check` 与 `conventions status` 会对填充态给软告警、指向本命令，`tasks normalize --fix` 不代改空白层。

载体结构（v1 / v2 / v3 形态、三分区、稳定 ID、`history.md` / `retired.md`）与读写细则见[完整攻略 · conventions/：规范沉淀地](../guide#conventions-规范沉淀地)。

## 相关页面

- 上一篇：[初始化](./init)
- 下一篇：[发版与更新日志](./changelog)
- 参考：[完整攻略 · conventions/](../guide#conventions-规范沉淀地) · [完整攻略 · 存量规范载体迁移](../guide#存量规范载体迁移)
