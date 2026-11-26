// 暂存区守卫：active 任务档默认不入库（保持 git status 可见，也不写 .gitignore）
// 归档后只提交 archive 与代码；用户明确要求时用 FX_TOOLKIT_ALLOW_ACTIVE_TASKS=1 放行
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

export const ALLOW_ENV = "FX_TOOLKIT_ALLOW_ACTIVE_TASKS"
const ACTIVE_PREFIX = ".tasks/active/"

// 暂存区里的 active 任务档；git 不可用时返回 null，由调用方按「跳过」处理
export function stagedActiveTasks(root = process.cwd()) {
  try {
    const out = execFileSync("git", ["-c", "core.quotepath=false", "diff", "--cached", "--name-only", "--diff-filter=ACMR"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
    return out
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((file) => file.split("\\").join("/"))
      .filter((file) => file.startsWith(ACTIVE_PREFIX))
  } catch {
    return null
  }
}

// 判定：放行 / 非 git 仓库 / 无 active 暂存均通过，命中 active 暂存即失败
export function evaluate({ root = process.cwd(), allow = process.env[ALLOW_ENV] === "1" } = {}) {
  if (allow) return { status: "allowed", files: [] }
  const files = stagedActiveTasks(root)
  if (files === null) return { status: "skipped", files: [] }
  return { status: files.length > 0 ? "failed" : "passed", files }
}

/**
 * 自检假现场：git 仓库内暂存 active 应失败、只暂存普通文件应通过、放行与非 git 目录应跳过。
 * @return {string[]} 失败说明；空数组表示自检通过
 */
export function selfTest() {
  const failures = []
  const roots = []
  const run = (cwd, args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
  try {
    const root = mkdtempSync(join(tmpdir(), "fxts-tk-active-staged-"))
    roots.push(root)
    run(root, ["init", "-q"])
    run(root, ["config", "user.email", "self-test@example.com"])
    run(root, ["config", "user.name", "self-test"])
    mkdirSync(join(root, ".tasks", "active", "202611"), { recursive: true })
    mkdirSync(join(root, "src"), { recursive: true })
    writeFileSync(join(root, ".tasks", "active", "202611", "任务.md"), "task\n", "utf8")
    writeFileSync(join(root, "src", "a.ts"), "export {}\n", "utf8")
    run(root, ["add", "."])
    const hit = evaluate({ root, allow: false })
    if (hit.status !== "failed" || hit.files.length !== 1) failures.push(`暂存 active 未报错：${JSON.stringify(hit)}`)

    run(root, ["rm", "--cached", "-r", "-q", "."])
    run(root, ["add", "src/a.ts"])
    const clean = evaluate({ root, allow: false })
    if (clean.status !== "passed" || clean.files.length !== 0) failures.push(`只暂存普通文件被误报：${JSON.stringify(clean)}`)

    const allowed = evaluate({ root, allow: true })
    if (allowed.status !== "allowed") failures.push(`显式放行未跳过：${JSON.stringify(allowed)}`)

    const outside = mkdtempSync(join(tmpdir(), "fxts-tk-active-staged-nogit-"))
    roots.push(outside)
    const skipped = evaluate({ root: outside, allow: false })
    if (skipped.status !== "skipped") failures.push(`非 git 目录未跳过：${JSON.stringify(skipped)}`)
  } catch (error) {
    failures.push(`自检执行失败：${error instanceof Error ? error.message : String(error)}`)
  } finally {
    for (const dir of roots) rmSync(dir, { recursive: true, force: true })
  }
  return failures
}

// 直接执行时才产生副作用；被测试导入时只暴露纯函数
const isDirectRun = process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
if (isDirectRun) {
  if (process.argv.includes("--self-test")) {
    const failures = selfTest()
    if (failures.length > 0) {
      console.error("active 任务暂存检查自检失败：")
      for (const item of failures) console.error(`【error】${item}`)
      process.exitCode = 1
    } else {
      console.log("active 任务暂存检查自检通过")
    }
  } else {
    const result = evaluate()
    if (result.status === "allowed") {
      console.log(`active 任务暂存检查：已按 ${ALLOW_ENV}=1 放行`)
    } else if (result.status === "skipped") {
      console.log("active 任务暂存检查：非 git 仓库或 git 不可用，跳过")
    } else if (result.status === "failed") {
      console.error("active 任务暂存检查：")
      for (const file of result.files) console.error(`【error】${file} 已进入暂存区`)
      console.error(`共 ${result.files.length} 个 active 任务档被暂存：先归档（toolkit task archive）再提交，或显式设置 ${ALLOW_ENV}=1 放行`)
      process.exitCode = 1
    } else {
      console.log("active 任务暂存检查：暂存区不含 .tasks/active/ 文件")
    }
  }
}
