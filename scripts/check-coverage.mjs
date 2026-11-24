#!/usr/bin/env node
// 覆盖率双轨门禁：改动行覆盖率阻断「新代码未测」，全局下限兜底「整体塌方」
// 阈值唯一真源在本脚本；vitest.config 只负责产出报告（text / json / json-summary）
import { execFileSync } from "node:child_process"
import { appendFileSync, existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
// 改动行门槛与全局下限：数值调整只改这里
const PATCH_THRESHOLD = 80
const MIN_PATCH_STATEMENTS = 5
const FLOORS = { statements: 78, branches: 65, functions: 82, lines: 81 }
// 编排层：命令注册、输出文案与交互向导，正确性由 CLI 契约测试守，不参与改动行判定（新增命令层目录时在此登记）
const ADAPTER_PREFIXES = ["src/commands/", "src/setup/", "src/usage/wizard.ts", "src/cli-main.ts", "src/status.ts"]

/**
 * 读取命令行参数：--diff 指定 unified diff 文件（测试用），--coverage 指定报告目录
 * @param {string[]} argv 进程参数（不含 node 与脚本名）
 * @return {{ diffFile: string, coverageDir: string }} 解析结果
 */
function parseArgs(argv) {
  const options = { diffFile: "", coverageDir: join(ROOT, "coverage"), noFloors: false }
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--diff") options.diffFile = argv[index + 1] ?? ""
    if (argv[index] === "--coverage") options.coverageDir = argv[index + 1] ?? options.coverageDir
    // 局部采集（本地只覆盖改动文件）时全局下限算不出，跳过
    if (argv[index] === "--no-floors") options.noFloors = true
  }
  return options
}

/**
 * 执行 git 命令并归一换行。
 * @param {string[]} args git 参数
 * @return {string|null} 输出文本；命令失败时返回 null
 */
function git(args) {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).replace(/\r\n/g, "\n")
  } catch {
    return null
  }
}

/**
 * 解析 unified diff，提取每个源文件的新增行号。
 * 只保留 src 下的非测试 TS 文件；删除行、非目标文件一律忽略。
 * @param {string} diff unified diff 文本
 * @return {Map<string, Set<number>>} 仓库相对路径 → 新增行号集合
 */
function parseAddedLines(diff) {
  const added = new Map()
  let file = null
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) {
      const raw = line.slice(4).trim()
      const path = raw === "/dev/null" ? "" : raw.replace(/^b\//, "")
      const isTarget = path.startsWith("src/") && path.endsWith(".ts") && !path.includes("__tests__")
      file = isTarget ? path : null
      continue
    }
    if (!file) continue
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line)
    if (!hunk) continue
    const start = Number(hunk[1])
    const count = hunk[2] === undefined ? 1 : Number(hunk[2])
    if (count === 0) continue
    const lines = added.get(file) ?? new Set()
    for (let offset = 0; offset < count; offset += 1) lines.add(start + offset)
    added.set(file, lines)
  }
  return added
}

/**
 * 收集本次改动的行：优先 CI 基线，本地取工作区改动并把未跟踪文件按全量新增计入。
 * @param {object} options 解析后的参数
 * @return {{ added: Map<string, Set<number>>, note: string }} 改动行与降级说明
 */
function collectChangedLines(options) {
  if (options.diffFile) {
    return { added: parseAddedLines(readFileSync(join(ROOT, options.diffFile), "utf8")), note: "" }
  }
  const base = process.env.VERIFY_DIFF_BASE ?? ""
  const diff = git(["diff", "-U0", ...(base ? [base] : ["HEAD"]), "--", "src"])
  if (diff === null) return { added: new Map(), note: "git 不可用或基线无效，跳过改动行判定" }
  const added = parseAddedLines(diff)
  // CI 已有基线：提交内容已在 diff 内，不再扫未跟踪文件
  if (base) return { added, note: "" }
  const untracked = git(["ls-files", "--others", "--exclude-standard", "--", "src"])
  if (untracked === null) return { added, note: "git 不可用，未跟踪文件未计入改动行" }
  for (const rel of untracked.split("\n").map((line) => line.trim()).filter(Boolean)) {
    if (!rel.endsWith(".ts") || rel.includes("__tests__")) continue
    const text = readFileSync(join(ROOT, rel), "utf8")
    const total = text.split(/\r?\n/).length
    const lines = added.get(rel) ?? new Set()
    for (let line = 1; line <= total; line += 1) lines.add(line)
    added.set(rel, lines)
  }
  return { added, note: "" }
}

/**
 * 在覆盖率报告中按路径后缀查找文件条目（报告内是绝对路径，跨平台分隔符不同）。
 * @param {Record<string, any>} coverage coverage-final.json 内容
 * @param {string} rel 仓库相对路径
 * @return {any|null} 文件条目；未进入统计时返回 null
 */
function findEntry(coverage, rel) {
  for (const key of Object.keys(coverage)) {
    if (key.replace(/\\/g, "/").endsWith(`/${rel}`)) return coverage[key]
  }
  return null
}

/**
 * 双轨判定：全局下限 + 改动行覆盖率。
 * @param {object} input 判定输入
 * @param {Map<string, Set<number>>} input.added 改动行
 * @param {Record<string, any>} input.coverage coverage-final.json
 * @param {Record<string, { pct: number }>} input.total 覆盖率汇总 total
 * @return {{ ok: boolean, problems: string[], notes: string[] }} 判定结果
 */
function evaluate({ added, coverage, total, checkFloors = true }) {
  const problems = []
  const notes = []

  // 全局下限：只在整体塌方时触发，正常改动不该碰到；局部采集模式下算不出，跳过并说明
  if (checkFloors) {
    for (const [metric, floor] of Object.entries(FLOORS)) {
      const pct = total?.[metric]?.pct
      if (typeof pct !== "number") {
        notes.push(`覆盖率汇总缺少 ${metric} 百分比，跳过该下限`)
        continue
      }
      if (pct < floor) problems.push(`全局 ${metric} ${pct}% 低于下限 ${floor}%`)
    }
  } else {
    notes.push("局部采集模式，跳过全局下限（仅流水线与 --full 校验）")
  }

  // 改动行：只统计起始行落在新增行上的语句，避免历史低覆盖目录拖累判定
  let statements = 0
  let covered = 0
  const uncovered = []
  for (const [rel, lines] of added) {
    // 编排层跳过：其正确性由 CLI 契约测试覆盖，按行强求只会生产无效用例
    if (ADAPTER_PREFIXES.some((prefix) => rel.startsWith(prefix))) continue
    const entry = findEntry(coverage, rel)
    if (!entry) continue
    for (const [id, statement] of Object.entries(entry.statementMap ?? {})) {
      const line = statement.start.line
      if (!lines.has(line)) continue
      statements += 1
      if ((entry.s?.[id] ?? 0) > 0) covered += 1
      else uncovered.push(`${rel}:${line}`)
    }
  }
  if (statements === 0) {
    notes.push("本次改动没有可统计的 src 语句，跳过改动行判定")
  } else if (statements < MIN_PATCH_STATEMENTS) {
    notes.push(`改动语句仅 ${statements} 条（少于 ${MIN_PATCH_STATEMENTS}），跳过改动行判定`)
  } else {
    const pct = (covered / statements) * 100
    if (pct < PATCH_THRESHOLD) {
      const listed = uncovered.slice(0, 20).join("、")
      const more = uncovered.length > 20 ? ` …（共 ${uncovered.length} 行）` : ""
      problems.push(`改动行覆盖率 ${pct.toFixed(1)}%（${covered}/${statements}）低于 ${PATCH_THRESHOLD}%，未覆盖：${listed}${more}`)
    } else {
      notes.push(`改动行覆盖率 ${pct.toFixed(1)}%（${covered}/${statements}）`)
    }
  }
  return { ok: problems.length === 0, problems, notes }
}

/**
 * GitHub Actions 作业摘要：存在 GITHUB_STEP_SUMMARY 时追加覆盖率摘要；本地与 GitLab 不写。
 * @param {Record<string, any>} summary coverage-summary.json 内容
 * @param {{ ok: boolean, problems: string[], notes: string[] }} result 判定结果
 * @return {void}
 */
function writeGithubSummary(summary, result) {
  const target = process.env.GITHUB_STEP_SUMMARY ?? ""
  if (!target) return
  const lines = ["## 覆盖率", "", "| 指标 | 覆盖 |", "| --- | --- |"]
  for (const metric of ["statements", "branches", "functions", "lines"]) {
    const pct = summary?.total?.[metric]?.pct
    if (typeof pct === "number") lines.push(`| ${metric} | ${pct}% |`)
  }
  lines.push("", "结论：", "")
  for (const note of result.notes) lines.push(`- ${note}`)
  for (const problem of result.problems) lines.push(`- ✖ ${problem}`)
  appendFileSync(target, `${lines.join("\n")}\n`, "utf8")
}

/**
 * 入口：读取报告与改动行，输出结论并按结论退出。
 * @return {void}
 */
function main() {
  const options = parseArgs(process.argv.slice(2))
  const coverageFile = join(options.coverageDir, "coverage-final.json")
  const summaryFile = join(options.coverageDir, "coverage-summary.json")
  if (!existsSync(coverageFile) || !existsSync(summaryFile)) {
    console.error(`✖ 覆盖率门禁：缺少 ${coverageFile} 或 ${summaryFile}，请先执行带覆盖率的单测`)
    process.exit(1)
  }
  const coverage = JSON.parse(readFileSync(coverageFile, "utf8"))
  const summary = JSON.parse(readFileSync(summaryFile, "utf8"))
  const changed = collectChangedLines(options)
  if (changed.note) console.log(`提示：${changed.note}`)
  const result = evaluate({ added: changed.added, coverage, total: summary.total, checkFloors: !options.noFloors })
  for (const note of result.notes) console.log(`· ${note}`)
  writeGithubSummary(summary, result)
  if (!result.ok) {
    for (const problem of result.problems) console.error(`✖ ${problem}`)
    process.exit(1)
  }
  console.log("✔ 覆盖率门禁通过")
}

main()
