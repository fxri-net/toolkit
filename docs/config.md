# 配置参考

> 目标读者：需要按项目定制行为的用户。字段枚举与 `src/config.ts` 解析代码同源。

## 解决什么问题

不同项目对脱敏、告警、语言、导入列映射的需求不同；`.toolkitrc.json` 让这些定制随仓库走、团队共享。

## 查找规则

- 从 `process.cwd()` **向上逐级**查找最近的 `.toolkitrc.json`，找到即用（支持在 monorepo 子目录运行，读最近一份）
- 某级文件存在但 JSON 非法：跳过该级继续向上，都不合法视为无配置
- 带 UTF-8 BOM 的配置文件可正常解析（Windows 下 PowerShell 写出场景）
- 未找到：全部使用默认值
- 不设强制 schema/版本字段：未知字段忽略，配置项变更随主版本记录于 CHANGELOG，读取向后兼容

## 字段总览

```json
{
  "redact":      { "enabled": true, "disable": [], "rules": [] },
  "check":       { "warnings": true, "includeCheckbox": true, "pendingMarkers": true },
  "tasks":       { "importColumns": {} },
  "changelog":   { "languages": {} },
  "updateCheck": { "enabled": true }
}
```

## redact：隐私脱敏

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `enabled` | boolean | `true` | 总开关；被 CLI `--redact/--no-redact` 与环境变量 `FX_REDACT` 覆盖 |
| `disable` | string[] | `[]` | 按 `name` 禁用内置规则（如 `["手机号"]`），被禁用规则不再匹配，对应信息原样保留 |
| `rules` | object[] | `[]` | 自定义规则，**优先于内置**；同 `name` 可覆盖内置 |

自定义规则结构：

```json
{
  "redact": {
    "rules": [
      { "name": "自定义码", "pattern": "cod-[0-9]{6}", "flags": "i", "replacement": "cod-******" }
    ]
  }
}
```

| 字段 | 说明 |
| --- | --- |
| `name` | 规则名；与内置同名即覆盖，也可放进 `disable` 引用 |
| `pattern` | 正则字符串 |
| `flags` | 正则标志（可选，如 `i`） |
| `replacement` | 替换文本（可选，默认整体掩码） |

内置规则：邮箱、手机号、身份证、IPv4、含端口内网 URL、JWT、GitHub Token（经典与细粒度）、OpenAI API Key（经典与项目级）、Slack Token。密钥类带长度门槛避免误伤。

## check：校验与告警

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `warnings` | boolean | `true` | 软告警总开关（`tasks check` 的 warn 输出、归档/发版提醒）；被 `--warn/--no-warn` 与 `FX_CHECK_WARN` 覆盖 |
| `includeCheckbox` | boolean | `true` | `tasks check` 是否把正文未勾选的 `- [ ]` 扫为未闭合待办 |
| `pendingMarkers` | boolean | `true` | `tasks check` 是否扫描词标记（待办/待实施/…）；只扫正文不扫标题 |

## tasks：任务目录与导入列映射

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `dir` | string | `".tasks"` | 任务目录（1.7.0 新增）；支持绝对路径或 `../` 相对路径，任务区可放项目外（如独立文档仓库）；被 CLI `--dir` 覆盖，`init` 与 `tasks` 同口径 |
| `importColumns` | object | 无 | 键 = 实际表头列名（匹配不区分大小写），值 = 标准字段名（`title`/`status`/`owner`/`scope`/`created`/`updated`/`completed`/`depends`/`body`）；优先级高于内置别名表 |

```json
{
  "tasks": {
    "dir": "../my-tasks-repo",
    "importColumns": { "我的标题": "title", "Deadline": "completed" }
  }
}
```

## changelog：语言表

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `languages` | object | 无 | 追加或覆盖语言；内置 `zh`/`en`，配置同名 key 覆盖内置，新 key 追加 |

每个语言为三段结构：

```json
{
  "changelog": {
    "languages": {
      "ja": {
        "replacements": { "### Major Changes": "### 🚨 重大変更" },
        "deps": "- 依存関係を更新",
        "released": "リリース"
      }
    }
  }
}
```

| 字段 | 说明 |
| --- | --- |
| `replacements` | 分组标题替换映射（源标题 → 目标标题） |
| `deps` | 依赖更新条目文案 |
| `released` | 发布日期后缀 |

## updateCheck：升级检查提示（1.7.0 新增）

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `enabled` | boolean | `true` | 升级检查总开关；`false` 时 CLI 不发起任何网络请求 |

CLI 每次命令执行末尾会异步查询 npm registry 最新版本（1 秒超时，离线/内网/超时静默失败），检测到新版本时输出一行升级提示；查询结果在系统临时目录缓存 24 小时，避免重复请求。关闭方式三选一：环境变量 `FX_NO_UPDATE_CHECK` 设为真值（`0/false/off/no` 视为未关闭，其余视为关闭）、本配置项设为 `false`。该检查不阻塞命令、不影响退出码。

## 相关页面

- [完整攻略 · 隐私脱敏](./guide#隐私脱敏)：脱敏效果示例
- [CLI 参考](./cli)：三档开关的命令行覆盖方式
