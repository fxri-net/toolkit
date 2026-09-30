---
"@fxri/toolkit": patch
---

- 修复：`toolkit skills install` / `status` / `remove` 此前只把技能分发到用户全局目录，项目内装的 toolkit 落点也不在项目、队友 clone 后拿不到；现新增 `--scope <project|global|all>`，缺省按 CLI 安装位置自动判定（项目内装的落项目面、全局装的落全局面），项目面随 git 入库、clone 即用
- 修复：项目面技能采用「唯一真源 + 多份入口薄壳」形态——完整副本恒定落 `<仓库根>/.agents/skills/`，其余已存在的候选技能目录各放一个指向真源的薄壳 `SKILL.md`，agent 循薄壳读真源，避免重复真源
- 修复：项目面归属账落 `<仓库根>/.toolkit/state.json`（随仓库入库，记真源与各薄壳落点的仓库相对路径）
- 修复：`toolkit init` 幂等写入 `prepare` 钩子（`toolkit skills install --scope project`），`pnpm install`（含 `pnpm up @fxri/toolkit`）时自动刷新项目面真源与薄壳，消除手动重跑；仅当本包为项目本地依赖时写入，未声明本地依赖（如全局安装）时不写、需要时手工补，绕过 `init` 直接 `skills install --scope project` 启用项目面者需自行补钩子；不需者用 `--no-hooks` 关闭
- 文档：同步 `skills` 域 `--scope`、`init --no-hooks` 与项目面分发说明（README / guide / handbook / faq / getting-started / cli）
