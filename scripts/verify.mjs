import { spawn, spawnSync } from "node:child_process"
import { readFileSync, statSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

// 单一门禁真源：本仓库全部验收步骤由本脚本定义并按序执行，本地与四处 CI（GitHub check / windows / macos、GitLab test）共用同一份清单。
// 目的：消除「各写一份步骤清单、彼此漂移」的结构性问题，使「本地自检通过、CI 才暴露」在清单层面不可能发生。
// 本文件不入 npm 包（files 白名单不含 scripts）
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const isWindows = process.platform === "win32"

const flags = new Set(process.argv.slice(2))
const skipCoverage = flags.has("--skip-coverage")
const skipDocs = flags.has("--skip-docs")
// --full 强制全量：忽略本地缓存与改动面判断，等价于 CI 口径
const full = flags.has("--full")
// CI 环境一律全量：本地按改动面裁剪只应让步于开发效率，不能让 CI 漏检死链与冷缓存问题
const ciValue = process.env.CI ?? ""
const isCI = ciValue !== "" && ciValue !== "0" && ciValue.toLowerCase() !== "false"

/**
 * 读取文本文件并去除首尾空白。
 * @param {string} file 绝对路径
 * @return {string} 去掉首尾空白后的内容
 */
function readTrimmed(file) {
  return readFileSync(file, "utf8").trim()
}

// 工具链版本仅作对照提示、不拦截：跨环境误判的常见疑点之一就是本地与 CI 的 node / pnpm 版本不同，先让人看见
function reportToolchain() {
  const { packageManager } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
  const expectedNode = readTrimmed(join(root, ".node-version"))
  const expectedPnpm = String(packageManager).replace(/^pnpm@/, "")
  const actualNode = process.version.replace(/^v/, "")
  const actualPnpm = (spawnSync("pnpm", ["--version"], { encoding: "utf8", shell: isWindows }).stdout ?? "").trim()

  console.log(`门禁校验：node ${actualNode}（仓库期望 ${expectedNode}）/ pnpm ${actualPnpm}（仓库期望 ${expectedPnpm}）`)
  if (actualNode !== expectedNode) {
    console.warn(`⚠️ node 版本与 .node-version 不一致：本地 ${actualNode}、CI ${expectedNode}，行为差异需由 windows job 对向兜底`)
  }
  if (actualPnpm !== expectedPnpm) {
    console.warn(`⚠️ pnpm 版本与 packageManager 不一致：本地 ${actualPnpm}、仓库声明 ${expectedPnpm}`)
  }
}

/**
 * 收集本地相对 HEAD 的改动文件（含未跟踪文件）。
 * @return {Set<string>|null} 仓库根相对路径集合；git 不可用时返回 null（调用方按「可能触及」保守处理）
 */
function changedFiles() {
  const names = new Set()
  const diff = spawnSync("git", ["diff", "--name-only", "HEAD"], { cwd: root, encoding: "utf8" })
  if (diff.status !== 0) return null
  const untracked = spawnSync("git", ["ls-files", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" })
  if (untracked.status !== 0) return null
  for (const raw of `${diff.stdout}\n${untracked.stdout}`.split(/\r?\n/)) {
    const line = raw.trim()
    if (line) names.add(line)
  }
  return names
}

// 文档站构建的触发面：文档内容、根说明与技能包都会被 VitePress 读取渲染，任一变动都可能引发死链
const DOC_TOUCH_PREFIXES = ["docs/"]
const DOC_TOUCH_FILES = new Set(["README.md"])

/**
 * 判断本次是否需要构建文档站（死链检查）。
 * @return {boolean} true 表示需要执行 docs:build
 */
function needDocsBuild() {
  if (isCI || full) return true
  const names = changedFiles()
  // 拿不到改动面时保守执行，宁可多跑一次也不漏检
  if (names === null) return true
  for (const name of names) {
    if (DOC_TOUCH_FILES.has(name)) return true
    if (DOC_TOUCH_PREFIXES.some((prefix) => name.startsWith(prefix))) return true
    if (name.startsWith("skills/")) return true
  }
  return false
}

/**
 * 判断依赖是否需要重装：lockfile 比已安装快照更新，或安装目录缺失。
 * @return {boolean} true 表示需要执行 pnpm install
 */
function needInstall() {
  if (isCI || full) return true
  try {
    const lock = statSync(join(root, "pnpm-lock.yaml")).mtimeMs
    const installed = statSync(join(root, "node_modules", ".pnpm", "lock.yaml")).mtimeMs
    return lock > installed
  } catch {
    return true
  }
}

// 步骤清单即门禁定义：顺序有依赖（build 先于冒烟与任务区体检），增删步骤只改这里
// 时区（TZ）按「数据来源」分两轴钉死，避免「本地绿、CI 红」的时区耦合回归（墙上时间串不带时区，解析结果随运行环境漂移）：
// ① 合成数据步骤（单元测试 / 覆盖率门槛）钉 TZ=UTC：被测数据由测试当场构造、与运行环境时区无关，钉 UTC 使本地与全部 CI 同轴；
// ② 读真实任务数据的步骤（本源仓库自检 / 任务区体检 / 归档块归一核验）钉 TZ=Asia/Shanghai：任务档按本地时区书写，须在数据原地时区判定，
//    否则 UTC 环境会把 +8 墙上串前移 8 小时而误报「未来时间」，该误报正是本次拆解的目标
// CLI 冒烟与任务区体检统一关闭升级提示：门禁输出保持确定，提示行为由单测覆盖
const cliEnv = { FX_NO_UPDATE_CHECK: "1" }
const installNeeded = needInstall()
const docsNeeded = needDocsBuild()

// 互不依赖、可并行的前置检查：类型 / 规范一致性 / 静态检查，三者都不读 dist、不写工作区
const parallelSteps = [
  { label: "类型检查", command: "pnpm", args: ["typecheck"] },
  // 文档站类型检查：VitePress 构建只转译不类型检查，?raw / JSON / .vue 导入需 vue-tsc 兜住
  { label: "文档类型检查", command: "pnpm", args: ["typecheck:docs"] },
  // 文档规则数据由 templates/rules 生成，检查生成物未漂移
  { label: "文档规则产物同步", args: ["scripts/generate-docs-rules.mjs", "--check"] },
  // 仓库自检：技能版本四点一致、技能表用途列不残留旧术语、active 任务触达路径存在
  { label: "规范一致性（技能版本 / 用途列 / 触达）", args: ["scripts/check-consistency.mjs"] },
  // eslint 默认缓存加速本地重复运行；CI 与 --full 走冷缓存，且本地冷缓存抖动时缓存本身也会造成「本地绿、CI 红」，故只作本地提速手段
  { label: isCI || full ? "静态检查（冷缓存）" : "静态检查", command: "pnpm", args: ["exec", "eslint", ".", ...(isCI || full ? ["--no-cache"] : ["--cache"])] },
]

// 串行步骤：单测与 build 之后再跑以下步骤，避免并行抢占 CPU 与读写产物
const serialSteps = [
  {
    label: skipCoverage ? "单元测试（不含覆盖率）" : "单元测试 + 覆盖率门槛",
    command: "pnpm",
    // 覆盖率与单测合并为一次运行：同一批测试不再跑两遍，检查项与阈值判定不变
    args: ["exec", "vitest", "run", ...(skipCoverage ? [] : ["--coverage"]), "--exclude", "src/__tests__/warn-threshold.test.ts"],
    env: { TZ: "UTC" },
  },
  // 本仓库自检：读真实 .tasks/.changeset 断言双零，须在数据原地时区（Asia/Shanghai）判定，故不走钉 UTC 的常规单测步
  { label: "本源仓库自检（真实数据双零）", command: "pnpm", args: ["test:repo-guard"], env: { TZ: "Asia/Shanghai" } },
  { label: "构建", command: "pnpm", args: ["build"] },
  // 镜像校验依赖 dist/cli.js，须置于构建之后；仅本仓自举产物，不依赖全局工具
  { label: "CHANGELOG 镜像一致（changelog doc --check）", args: ["dist/cli.js", "changelog", "doc", "--check"], env: cliEnv },
  { label: "文档站构建（死链检查）", command: "pnpm", args: ["docs:build"], skip: skipDocs ? "--skip-docs" : docsNeeded ? "" : "未触及 docs/、README.md、skills/" },
  // 产物断言依赖上一步的 dist，跳过构建时一并跳过
  { label: "文档站产物（404 排除站点地图与搜索索引）", args: ["scripts/check-docs-dist.mjs"], skip: skipDocs ? "--skip-docs" : docsNeeded ? "" : "未触及 docs/、README.md、skills/" },
  { label: "CLI 冒烟 --help", args: ["dist/cli.js", "--help"], env: cliEnv },
  { label: "CLI 冒烟 tasks --help", args: ["dist/cli.js", "tasks", "--help"], env: cliEnv },
  { label: "CLI 冒烟 changelog --help", args: ["dist/cli.js", "changelog", "--help"], env: cliEnv },
  { label: "任务区体检（tasks check）", args: ["dist/cli.js", "tasks", "check"], env: { TZ: "Asia/Shanghai", ...cliEnv } },
  { label: "归档块归一核验（tasks normalize）", args: ["dist/cli.js", "tasks", "normalize"], env: { TZ: "Asia/Shanghai", ...cliEnv } },
]

/**
 * 运行单个步骤并捕获输出，用于并行组（并发时继承 stdio 会互相穿插，故先缓存再按步骤顺序回放）。
 * @param {{label: string, command?: string, args: string[], env?: Record<string, string>}} step 步骤定义
 * @return {Promise<{step: object, code: number, stdout: string, stderr: string}>} 步骤与退出码、输出
 */
function runCaptured(step) {
  return new Promise((resolve) => {
    const command = step.command ?? process.execPath
    const child = spawn(command, step.args, { cwd: root, shell: command === "pnpm" && isWindows, env: { ...process.env, ...step.env } })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => (stdout += chunk))
    child.stderr.on("data", (chunk) => (stderr += chunk))
    child.on("error", (err) => resolve({ step, code: 1, stdout, stderr: `${stderr}${err}` }))
    child.on("close", (code) => resolve({ step, code: code ?? 1, stdout, stderr }))
  })
}

reportToolchain()
const startedAt = Date.now()
const failures = []
let executed = 0

if (installNeeded) {
  console.log("\n▶ 安装依赖（frozen 锁文件）")
  executed += 1
  // pnpm 在 Windows 上是 .cmd，需经 shell 调用；node 用 process.execPath 直呼，避免路径含空格时被 shell 拆断
  const install = spawnSync("pnpm", ["install", "--frozen-lockfile"], { cwd: root, stdio: "inherit", shell: isWindows })
  if (install.status !== 0) {
    // 依赖装不上则后续步骤的失败都是噪音，直接中止
    console.error("\n✖ 门禁未通过：1 步失败\n  - 安装依赖（frozen 锁文件）")
    process.exit(1)
  }
} else {
  console.log("\n⊘ 安装依赖（lockfile 未变化，跳过；--full 强制全量）")
}

console.log(`\n▶ 并行检查（${parallelSteps.length} 项：${parallelSteps.map((s) => s.label).join(" / ")}）`)
executed += parallelSteps.length
const parallelResults = await Promise.all(parallelSteps.map(runCaptured))
for (const { step, code, stdout, stderr } of parallelResults) {
  console.log(`\n—— ${step.label} ——`)
  if (stdout) process.stdout.write(stdout)
  if (stderr) process.stderr.write(stderr)
  if (code !== 0) failures.push(step.label)
}

for (const step of serialSteps) {
  if (step.skip) {
    console.log(`\n⊘ ${step.label}（${step.skip}，跳过）`)
    continue
  }
  console.log(`\n▶ ${step.label}`)
  executed += 1
  const command = step.command ?? process.execPath
  const result = spawnSync(command, step.args, { cwd: root, stdio: "inherit", shell: command === "pnpm" && isWindows, env: { ...process.env, ...step.env } })
  if (result.status !== 0) failures.push(step.label)
}

const seconds = ((Date.now() - startedAt) / 1000).toFixed(1)

if (failures.length > 0) {
  console.error(`\n✖ 门禁未通过：${failures.length} 步失败（用时 ${seconds}s）`)
  for (const label of failures) console.error(`  - ${label}`)
  process.exit(1)
}

console.log(`\n✔ 门禁全部通过（共 ${executed} 步，用时 ${seconds}s）`)
