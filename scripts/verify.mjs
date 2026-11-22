import { spawn, spawnSync } from "node:child_process"
import { readFileSync, statSync, existsSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { isTouchPath } from "./touch-surface.mjs"

// 单一门禁真源：本仓库全部验收步骤由本脚本定义并按序执行，本地与四处 CI（GitHub check / windows / macos、GitLab test）共用同一份清单。
// 目的：消除「各写一份步骤清单、彼此漂移」的结构性问题，使「本地自检通过、CI 才暴露」在清单层面不可能发生。
// 本文件不入 npm 包（files 白名单不含 scripts）
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const isWindows = process.platform === "win32"
const require = createRequire(import.meta.url)

const flags = new Set(process.argv.slice(2))
const skipDocs = flags.has("--skip-docs")
// --tests-only：跨平台 job 专用裁剪——只装依赖并跑单测；静态检查、构建、文档与 CLI 收尾由 ubuntu 全量承担
const testsOnly = flags.has("--tests-only")
// --local 强制本地口径：IDE / 终端可能注入 CI=true，导致本地迭代也走全量（文档必建、eslint 冷缓存、强制安装）。
// 提交前最终验收仍应跑不带 --local 的全量，避免把本地裁剪带进 CI。
const forceLocal = flags.has("--local")
// --full 强制全量：忽略本地缓存与改动面判断，等价于 CI 口径；与 --local 同时出现时以 --full 为准
const full = flags.has("--full")
// 覆盖率是门禁最重单项，本地口径默认跳过；提交前不带 --local 的全量仍跑覆盖率（--full 优先）
const skipCoverage = flags.has("--skip-coverage") || testsOnly || (forceLocal && !full)
// CI 环境一律全量：本地按改动面裁剪只应让步于开发效率，不能让 CI 漏检死链与冷缓存问题
const ciValue = process.env.CI ?? ""
const isCI = !forceLocal && ciValue !== "" && ciValue !== "0" && ciValue.toLowerCase() !== "false"

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

// 判定一组改动文件是否触及文档站构建面（触达面清单与其它自检脚本共用 scripts/touch-surface.mjs）
function docsTouched(names) {
  for (const name of names) {
    if (isTouchPath(name)) return true
  }
  return false
}

/**
 * 读取 base..HEAD 的改动文件（CI 由工作流传 base；首推 / 强推可能取不到有效基线）。
 * @param {string} base 基线提交
 * @return {string[]|null} 改动文件列表；git 不可用或基线无效时返回 null
 */
function diffNames(base) {
  const res = spawnSync("git", ["diff", "--name-only", base, "HEAD"], { cwd: root, encoding: "utf8" })
  if (res.status !== 0) return null
  return res.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
}

/**
 * 判断本次是否需要构建文档站（死链检查）。
 * 判断口径只在本脚本内维护：CI 传 VERIFY_DIFF_BASE，本地按工作区改动面，其余情况保守全跑。
 * @return {boolean} true 表示需要执行 docs:build
 */
function needDocsBuild() {
  if (full) return true
  const base = (process.env.VERIFY_DIFF_BASE ?? "").trim()
  if (base) {
    const names = diffNames(base)
    // 取不到改动面（首推 / 强推 / 基线失效）时保守执行，宁可多跑一次也不漏检
    return names === null ? true : docsTouched(names)
  }
  if (isCI) return true
  const names = changedFiles()
  if (names === null) return true
  return docsTouched(names)
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

// 构建的触发面：dist/ 只由源码、构建配置与依赖决定；只改文档 / 技能 / 测试时复用既有产物，收尾步骤不受影响
const BUILD_TOUCH_PREFIXES = ["src/"]
const BUILD_TOUCH_FILES = new Set(["package.json", "pnpm-lock.yaml", "tsup.config.ts", "tsup.dev.config.ts"])

/**
 * 判断本次是否需要重新构建。
 * @return {string} 空串表示需要构建；非空为跳过原因
 */
function buildSkipReason() {
  if (isCI || full) return ""
  const names = changedFiles()
  // 拿不到改动面时保守构建
  if (names === null) return ""
  // dist 缺失时无从复用
  if (!existsSync(join(root, "dist", "cli.js"))) return ""
  for (const name of names) {
    if (BUILD_TOUCH_PREFIXES.some((prefix) => name.startsWith(prefix))) return ""
    if (BUILD_TOUCH_FILES.has(name)) return ""
    // 根 tsconfig 决定 dts 产物，派生配置同样可能影响构建
    if (/^tsconfig[^/]*\.json$/.test(name)) return ""
  }
  return "未触及 src/、构建配置与依赖"
}

// 本地包 bin 解析：直调 node + 入口，绕过 pnpm / corepack 垫片（Windows 上每步可省约 1 秒）；失败返回 null 由调用方回落
const TOOL_PACKAGES = {
  tsc: "typescript",
  "vue-tsc": "vue-tsc",
  eslint: "eslint",
  vitest: "vitest",
  tsup: "tsup",
  vitepress: "vitepress",
}
function localBin(tool) {
  const pkg = TOOL_PACKAGES[tool]
  if (!pkg) return null
  try {
    const pkgFile = require.resolve(`${pkg}/package.json`)
    const meta = JSON.parse(readFileSync(pkgFile, "utf8"))
    const rel = typeof meta.bin === "string" ? meta.bin : meta.bin?.[tool]
    return rel ? join(dirname(pkgFile), rel) : null
  } catch {
    return null
  }
}

/**
 * 步骤执行方式：声明了 tool 时优先直调本地入口，解析失败回落 pnpm exec；其余按 node 脚本或 pnpm 执行。
 * @param {object} step 步骤定义
 * @return {{command: string, args: string[], shell: boolean, env?: object}} 启动参数
 */
function commandOf(step) {
  if (step.tool) {
    const bin = localBin(step.tool)
    if (bin) return { command: process.execPath, args: [bin, ...step.args], shell: false, env: step.env }
    return { command: "pnpm", args: ["exec", step.tool, ...step.args], shell: isWindows, env: step.env }
  }
  if (step.command) return { command: step.command, args: step.args, shell: step.command === "pnpm" && isWindows, env: step.env }
  return { command: process.execPath, args: step.args, shell: false, env: step.env }
}

/**
 * 运行单个步骤并捕获输出，用于并行组（并发时继承 stdio 会互相穿插，故先缓存再按步骤顺序回放）。
 * @param {object} step 步骤定义
 * @return {Promise<{step: object, code: number, stdout: string, stderr: string, seconds: number}>} 步骤与退出码、输出、耗时
 */
function runCaptured(step) {
  return new Promise((resolve) => {
    const { command, args, shell, env } = commandOf(step)
    const started = Date.now()
    const child = spawn(command, args, { cwd: root, shell, env: { ...process.env, ...env } })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => (stdout += chunk))
    child.stderr.on("data", (chunk) => (stderr += chunk))
    child.on("error", (err) => resolve({ step, code: 1, stdout, stderr: `${stderr}${err}`, seconds: (Date.now() - started) / 1000 }))
    child.on("close", (code) => resolve({ step, code: code ?? 1, stdout, stderr, seconds: (Date.now() - started) / 1000 }))
  })
}

const cliEnv = { FX_TOOLKIT_NO_UPDATE_CHECK: "1" }
// 技能规范校验基线：优先最近标签，浅克隆 / 无标签时回落 HEAD（lint 自行说明跳过原因）
const skillBase = (() => {
  const tagged = spawnSync("git", ["describe", "--tags", "--abbrev=0"], { cwd: root, encoding: "utf8" })
  const ref = tagged.status === 0 ? tagged.stdout.trim() : ""
  return ref || "HEAD"
})()
const installNeeded = needInstall()
const docsNeeded = needDocsBuild()
const buildSkip = buildSkipReason()
const docsSkip = skipDocs ? "--skip-docs" : docsNeeded ? "" : "未触及 docs/、README.md、skills/"
// 文档类型检查只随改动面跳过：--skip-docs 只裁文档构建与产物校验，不裁类型检查（跨平台 job 走 --tests-only 时整段不进入）
const docsTypeSkip = docsNeeded ? "" : "未触及 docs/、README.md、skills/"

// 阶段一：互不依赖、可并行的前置检查；类型 / 规范一致性 / 静态检查都不读 dist、不写工作区
const parallelSteps = [
  { label: "类型检查", tool: "tsc", args: ["--noEmit", "-p", "tsconfig.typecheck.json"] },
  // 文档站类型检查：VitePress 构建只转译不类型检查，?raw / JSON / .vue 导入需 vue-tsc 兜住
  { label: "文档类型检查", tool: "vue-tsc", args: ["--noEmit", "-p", "docs/tsconfig.json"], skip: docsTypeSkip },
  // 文档规则数据由 templates/rules 生成，检查生成物未漂移
  { label: "文档规则产物同步", args: ["scripts/generate-docs-rules.mjs", "--check"] },
  // 升级页命令对照表由命令注册表生成，检查生成段未漂移
  { label: "升级页命令对照同步", args: ["scripts/generate-upgrade-table.mjs", "--check"] },
  // 项目面候选目录表由 PROJECT_SKILL_DIRS 生成，检查生成段未漂移
  { label: "技能候选目录同步", args: ["scripts/generate-skill-dirs.mjs", "--check"] },
  // 环境变量清单由 src/env.ts 生成，检查生成段未漂移
  { label: "环境变量清单同步", args: ["scripts/generate-env-table.mjs", "--check"] },
  // 退出码数值唯一来源：阻止 src 下重新出现 2 / 3 / 130 字面量
  { label: "退出码单一真源（字面量检查）", args: ["scripts/check-exit-codes.mjs"] },
  // 退出码文档表由 src/exit-codes.ts 生成，检查生成段未漂移
  { label: "退出码文档同步", args: ["scripts/generate-exit-codes.mjs", "--check"] },
  // 仓库自检：技能版本四点一致、技能表用途列不残留旧术语、active 任务触达路径存在
  { label: "规范一致性（技能版本 / 用途列 / 触达）", args: ["scripts/check-consistency.mjs"] },
  // 仓库自检：正文段落单行行宽与分号数（规范 C-43），存量按基线棘轮、只在超出时失败
  { label: "文档可读性（段落行宽 / 分号）", args: ["scripts/check-docs-readability.mjs"] },
  // eslint 默认缓存加速本地重复运行；CI 与 --full 走冷缓存，且本地冷缓存抖动时缓存本身也会造成「本地绿、CI 红」，故只作本地提速手段
  { label: isCI || full ? "静态检查（冷缓存）" : "静态检查", tool: "eslint", args: [".", ...(isCI || full ? ["--no-cache"] : ["--cache"])] },
]

// 阶段二：单测独占。覆盖率插桩 + 真实 git 操作用例对 CPU / 磁盘敏感，与构建、文档构建并发会触发随机超时（实测 15s 上限被打穿），
// 因此单测不与其它重步骤并发；构建、文档构建、仓库自检互不依赖，放到下一阶段并发。
const heavySteps = [
  {
    label: skipCoverage ? "单元测试（不含覆盖率）" : "单元测试 + 覆盖率门槛",
    tool: "vitest",
    // 覆盖率与单测合并为一次运行：同一批测试不再跑两遍，检查项与阈值判定不变
    args: ["run", ...(skipCoverage ? [] : ["--coverage", "--coverage.reporter=text"]), "--exclude", "src/__tests__/warn-threshold.test.ts"],
    env: { TZ: "UTC" },
  },
]

// 阶段三：构建（写 dist）、文档构建（写文档产物）、仓库自检（只读真实任务区）互不依赖，并发压缩墙钟时间
const buildSteps = [
  // 构建：tsup 直接调用，NODE_ENV 与 package.json 的 build 脚本保持一致
  { label: "构建", tool: "tsup", args: [], env: { NODE_ENV: "production" }, skip: buildSkip },
  { label: "文档站构建（死链检查）", tool: "vitepress", args: ["build", "docs"], skip: docsSkip },
  // 本仓库自检：读真实 .tasks/.changeset 断言双零，须在数据原地时区（Asia/Shanghai）判定
  { label: "本源仓库自检（真实数据双零）", tool: "vitest", args: ["run", "src/__tests__/warn-threshold.test.ts"], env: { TZ: "Asia/Shanghai" } },
]

// 阶段四：依赖 dist / 文档产物的收尾步骤，按序执行
const tailSteps = [
  // 仓库自检：与最近版本 tag 比对整句，提示可能被删掉的事实（只告警不阻断）
  { label: "文档无损（整句比对）", args: ["scripts/check-doc-loss.mjs"] },
  // 导航校验读 docs/site-nav.json，规则随包分发（不依赖文档构建产物）
  { label: "文档站导航规范（结构 / 命名 / 顶栏 / 侧栏）", args: ["dist/cli.js", "docs", "nav", "check"], env: cliEnv },
  // 镜像校验依赖 dist/cli.js，须置于构建之后；仅本仓自举产物，不依赖全局工具
  { label: "CHANGELOG 镜像一致（release mirror --check）", args: ["dist/cli.js", "release", "mirror", "--check"], env: cliEnv },
  // 产物断言依赖上一步 dist 与文档构建，跳过文档构建时一并跳过
  { label: "文档站产物（404 排除站点地图与搜索索引）", args: ["dist/cli.js", "docs", "dist", "check"], skip: docsSkip, env: cliEnv },
  { label: "CLI 冒烟 --help", args: ["dist/cli.js", "--help"], env: cliEnv },
  { label: "CLI 冒烟 task --help", args: ["dist/cli.js", "task", "--help"], env: cliEnv },
  { label: "CLI 冒烟 release --help", args: ["dist/cli.js", "release", "--help"], env: cliEnv },
  // 技能规范：本仓技能必须通过 lint；--base 下内容变更未递增即失败，默认档只告警篇幅
  { label: "技能规范校验（skill lint）", args: ["dist/cli.js", "skill", "lint", "skills", "--base", skillBase], env: cliEnv },
  { label: "任务区体检（task check）", args: ["dist/cli.js", "task", "check"], env: { TZ: "Asia/Shanghai", ...cliEnv } },
  { label: "归档块归一核验（task normalize）", args: ["dist/cli.js", "task", "normalize"], env: { TZ: "Asia/Shanghai", ...cliEnv } },
]

/**
 * 执行一个并行阶段：先打印跳过项，再并发运行，最后按定义顺序回放输出与耗时。
 * @param {string} label 阶段名
 * @param {object[]} steps 步骤定义
 * @return {Promise<string[]>} 失败步骤标签
 */
async function runPhase(label, steps) {
  for (const step of steps) {
    if (step.skip) console.log(`\n⊘ ${step.label}（${step.skip}，跳过）`)
  }
  const active = steps.filter((step) => !step.skip)
  if (active.length === 0) return []
  console.log(`\n▶ ${label}（${active.length} 项：${active.map((step) => step.label).join(" / ")}）`)
  const started = Date.now()
  const results = await Promise.all(active.map((step) => runCaptured(step)))
  for (const { step, code, stdout, stderr, seconds } of results) {
    console.log(`\n—— ${step.label} ——（${seconds.toFixed(1)}s）`)
    if (stdout) process.stdout.write(stdout)
    if (stderr) process.stderr.write(stderr)
    if (code !== 0) console.log(`✖ ${step.label} 失败`)
  }
  console.log(`◀ ${label} 完成（${((Date.now() - started) / 1000).toFixed(1)}s）`)
  return results.filter((result) => result.code !== 0).map((result) => result.step.label)
}

/**
 * 串行执行收尾步骤，保留实时输出。
 * @param {object[]} steps 步骤定义
 * @return {string[]} 失败步骤标签
 */
function runSerial(steps) {
  const failures = []
  for (const step of steps) {
    if (step.skip) {
      console.log(`\n⊘ ${step.label}（${step.skip}，跳过）`)
      continue
    }
    console.log(`\n▶ ${step.label}`)
    const { command, args, shell, env } = commandOf(step)
    const started = Date.now()
    const result = spawnSync(command, args, { cwd: root, stdio: "inherit", shell, env: { ...process.env, ...env } })
    console.log(`  ⏱ ${((Date.now() - started) / 1000).toFixed(1)}s`)
    if (result.status !== 0) failures.push(step.label)
  }
  return failures
}

reportToolchain()
// 环境提示：CI 变量被 IDE 注入时，本地门禁会按 CI 全量执行，先让人看见原因与快速入口
if (!forceLocal && isCI && !(process.env.GITHUB_ACTIONS || process.env.GITLAB_CI)) {
  console.log("提示：检测到 CI 环境变量（可能由 IDE / 终端注入），本次按 CI 全量执行；本地迭代可加 --local 恢复改动面裁剪与缓存，并默认跳过覆盖率")
}
const startedAt = Date.now()

if (installNeeded) {
  console.log("\n▶ 安装依赖（frozen 锁文件）")
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

// 跨平台 job 的裁剪口径：只跑安装与单测，其余步骤已由 ubuntu 全量承担
if (testsOnly) {
  console.log("\n⊘ 仅单测口径（--tests-only）：跳过静态检查、构建、文档与收尾 CLI 步骤")
  const testsFailures = await runPhase("单元测试（单测口径）", heavySteps)
  const testsSeconds = ((Date.now() - startedAt) / 1000).toFixed(1)
  if (testsFailures.length > 0) {
    console.error(`\n✖ 门禁未通过：${testsFailures.length} 步失败（用时 ${testsSeconds}s）`)
    for (const label of testsFailures) console.error(`  - ${label}`)
    process.exit(1)
  }
  console.log(`\n✔ 门禁全部通过（仅单测口径，用时 ${testsSeconds}s）`)
  process.exit(0)
}

const phaseStarted = Date.now()
const failures = [
  ...(await runPhase("并行检查", parallelSteps)),
  ...(await runPhase("重步骤（单测独占）", heavySteps)),
  ...(await runPhase("构建与文档", buildSteps)),
  ...runSerial(tailSteps),
]
const seconds = ((Date.now() - startedAt) / 1000).toFixed(1)

if (failures.length > 0) {
  console.error(`\n✖ 门禁未通过：${failures.length} 步失败（用时 ${seconds}s）`)
  for (const label of failures) console.error(`  - ${label}`)
  process.exit(1)
}

console.log(`\n✔ 门禁全部通过（三步阶段共 ${((Date.now() - phaseStarted) / 1000).toFixed(1)}s，总计 ${seconds}s）`)
