---
owner: 唐启云
status: 待办
created: 20260905
updated: 20260905
completed: ''
depends_on:
  - 20260905-唐启云-文档站成熟度补齐.md
scope: toolkit
---

# .toolkitrc.json 全局配置支持

## 背景与目标

当前配置仅支持项目级：从 `process.cwd()` 向上查找最近的 `.toolkitrc.json`。个人偏好类配置（关升级提示、个人脱敏规则、自定义语言表）写进项目会共享给全团队，环境变量只对单次会话生效——需要全局配置层。已经用户确认立项，并定性为「原设计缺失的配套修补」，按 patch 归档变更集。

## 方案设计

- 全局文件位置：`~/.toolkitrc.json`（`os.homedir()`，Windows 即 `C:\Users\<用户>\.toolkitrc.json`），与 `.gitconfig`/`.npmrc` 惯例一致
- 查找与合并：
  1. 向上查找最近的 `.toolkitrc.json`（现状不变）
  2. 同时读取全局 `~/.toolkitrc.json`
  3. 按配置段合并（redact/check/tasks/changelog/updateCheck 五段）：项目出现的段整体覆盖全局同名段，项目未配的段落落到全局
  4. 全局文件非法 JSON / 带 BOM：同项目口径视为无全局配置，不报错
- 覆盖链不变：CLI `--flag` > 环境变量 > 项目配置 > 全局配置 > 默认值

## 变更范围

- 代码：`src/config.ts`（约 +20 行）；`src/__tests__/config.test.ts` 补全局层用例（合并/覆盖/非法文件/缓存失效）
- 文档：`docs/config.md` 查找规则章节、`docs/api.md` `loadToolkitConfig` 行描述同步
- 变更集：minor（新能力级）
- skills 无触达（已 grep 确认 skills/ 下无 toolkitrc 字样）

## 边界与注意

- 合并是段级整体覆盖，非字段级深合并，文档须写明该语义
- 全局文件是本机本用户属性，不随 git 走，换机器手动迁移

## 验收

- `pnpm test` 通过（新增全局层用例）
- `docs:build` 通过（文档站任务先行完成，构建链路已就绪）
- `toolkit tasks check` 双清零 → 归档 → 与代码变更同批提交
- 变更集随本轮合并发版（patch，预计 1.7.1）
