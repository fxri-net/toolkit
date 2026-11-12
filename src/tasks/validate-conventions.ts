// 规范载体校验：形态、表格、历史列与本地配置忽略体检，自 validate.ts 拆分
import { existsSync } from "node:fs"
import { join } from "node:path"
import { readTextFile } from "../read-text"
import { resolveLocalConfigPath } from "../config"
import { CARRIER_VERSION, CONVENTIONS_DIR, ENTRY_VERSION, HISTORY_ANCHOR_HEADER, HISTORY_FILE, ID_HEADER, INDEX_FILE, LEGACY_FILE, canonicalId, findTable, isIdCell, isPaddedIdCell, readCarrier, type CarrierState } from "../conventions/format"
import { detectShapeDefects } from "../conventions/shape"
import { findEntryShells, ignoredShellAlert, mismatchedShellAlert } from "../conventions/entry"
import { resolveCarrierRoot } from "../conventions/status"
import { filledTableLines, listMarkdownFiles } from "../conventions/compact"
import { gitIgnoredSet, inspectLocalConfigIgnore } from "../git-ignore"
import { displayRel } from "./paths"
import type { CheckIssue } from "./validate"


// 本地配置文件忽略体检：存在但未被忽略时软告警（warn 级，不改 error 阈值）
// 定位与判定同源：路径取自 resolveLocalConfigPath(cwd)，与 config status 共用同一来源，避免两处各查一套导致漂移
// 展示用相对 cwd 的路径（文件可能命中上层目录，故不能只取 basename），与 config status 的绝对路径形成互补
// 非 git 仓库 / 位于仓库工作树之外均属「忽略判定不适用」，不发告警（无从处置的告警等于噪声）；已跟踪态单列（疑似历史 git add -f）
function localConfigIssues(cwd: string): CheckIssue[] {
  const file = resolveLocalConfigPath(cwd)
  if (!file) return []
  const rel = displayRel(cwd, file)
  const ignore = inspectLocalConfigIgnore(file, cwd)
  if (ignore.state === "not-a-repo" || ignore.state === "outside-repo") return []
  if (ignore.state === "unavailable") {
    return [{ level: "warn", file: rel, message: `本地配置文件忽略判定不可用（${ignore.detail ?? "未知原因"}），请核实 git 环境` }]
  }
  if (ignore.state === "tracked") {
    return [
      {
        level: "warn",
        file: rel,
        message: `本地配置文件已被忽略规则覆盖但仍被 git 跟踪（疑似历史 git add -f）：执行 git rm --cached ${rel} 后才会真正不入库`,
      },
    ]
  }
  if (ignore.state === "ignored") return []
  return [{ level: "warn", file: rel, message: "本地配置文件未被 gitignore 覆盖，可能随 git 提交泄露个人配置：重跑 toolkit init 可自动补写忽略行" }]
}

// 规范载体形态检查（软告警，不读内容）：只读首行标记与文件存在性，形态判据走 format.ts 的单一实现
// 三态：v1（有 index.md、无 history.md、无标记）为合法存量不告警；形态异常（标记 / history.md / 首列 ID 三者不一致）告警
// 入口层：壳标记与当前 toolkit 不一致、壳被 gitignore 覆盖各合并为一条（多落点内联路径，不按壳重复）；无壳时不探测（避免无壳项目的进程开销）
// 载体细则见 skills/fxri-plan-to-task/references/conventions-spec.md
export function validateConventions(tasksDir: string, cwd: string): CheckIssue[] {
  const issues: CheckIssue[] = []
  const state = readCarrier(tasksDir)
  if (state.hasLegacy) {
    issues.push({
      level: "warn",
      file: LEGACY_FILE,
      message: state.hasDir
        ? "旧单文件规范载体已被 conventions/ 目录形态取代，建议清理（两者并存时以目录形态为准）"
        : "旧单文件规范载体，建议迁移为 conventions/ 目录形态（index.md 作唯一入口 + common.md / 端分册按需创建）",
    })
  }
  if (state.hasDir && !state.hasIndex) {
    issues.push({ level: "warn", file: `conventions/${INDEX_FILE}`, message: "规范载体缺 index.md（唯一入口与唯一权威），请补齐" })
  }
  if (state.form === "abnormal") {
    issues.push({
      level: "warn",
      file: `conventions/${INDEX_FILE}`,
      message:
        state.markerVersion === CARRIER_VERSION
          ? `规范载体标为 v${CARRIER_VERSION} 但缺 ${HISTORY_FILE} 或索引表首列非 ${ID_HEADER}，请补齐或执行 toolkit conventions upgrade`
          : `规范载体存在 ${HISTORY_FILE} 但索引表首列仍非 ${ID_HEADER}（形态异常），请人工确认`,
    })
  }
  issues.push(...validateTableShape(tasksDir, state))
  // 入口壳按任务目录所属仓库查找，跨仓 --dir 体检与仓内执行结论一致；本地配置仍按调用方 cwd 判定
  const carrierRoot = resolveCarrierRoot(tasksDir, cwd)
  const shells = findEntryShells(carrierRoot)
  // 一次批量判定全部落点的 gitignore 状态，避免逐壳各起一个 git 子进程
  const ignored = gitIgnoredSet(carrierRoot, shells.map((s) => s.file))
  const alerts = [
    mismatchedShellAlert(shells.filter((s) => s.version !== ENTRY_VERSION)),
    ignoredShellAlert(shells.filter((s) => ignored.has(s.file))),
  ]
  for (const alert of alerts) {
    if (alert) issues.push({ level: "warn", file: alert.file, message: alert.message })
  }
  issues.push(...localConfigIssues(cwd))
  return issues
}

// 表形态软告警：形态判定只看标记 + history 存在 + 索引表首列，列集合与列数漂移捕获不到，故在此补齐
// 判据与 conventions status 共用 detectShapeDefects，两处口径一致
function validateTableShape(tasksDir: string, state: CarrierState): CheckIssue[] {
  return detectShapeDefects(state).map((defect) => ({
    level: "warn" as const,
    file: displayRel(tasksDir, defect.file),
    ...(defect.line === undefined ? {} : { line: defect.line }),
    message: defect.message,
  }))
}

// 表格形态软告警：检出被格式化器填充（列对齐空白）的表格行，指向 conventions format 归一
// 只报不改：归一由 conventions format 统一负责（--fix 只管归档块，不代改空白层）
const TABLE_FORM_PREVIEW = 6
export function validateTableForm(tasksDir: string): CheckIssue[] {
  const issues: CheckIssue[] = []
  for (const file of listMarkdownFiles(tasksDir)) {
    const lines = filledTableLines(readTextFile(file))
    if (lines.length === 0) continue
    const shown = lines.slice(0, TABLE_FORM_PREVIEW).join("、")
    issues.push({
      level: "warn",
      file: displayRel(tasksDir, file),
      line: lines[0],
      message: `表格存在列对齐填充（偏离紧凑形态）${lines.length} 行（第 ${shown}${lines.length > TABLE_FORM_PREVIEW ? " …" : ""} 行）：执行 toolkit conventions format 归一`,
    })
  }
  return issues
}

// 演进记录首列 ID 形态软告警：v3 载体的历史行首列应为行内代码包裹的裸 ID `C-<n>`
// 只报不改：历史行只追加不改旧的元规则下，补齐须人工确认（升级侧另有同类「来源 / ID 补录报告」）
// v1 / v2 属合法存量，其 history.md 首列可由规则名承载、交由 upgrade 处理，故不在此告警
export function validateHistoryIdColumn(tasksDir: string): CheckIssue[] {
  if (readCarrier(tasksDir).form !== "v3") return []
  const file = join(tasksDir, CONVENTIONS_DIR, HISTORY_FILE)
  if (!existsSync(file)) return []
  const table = findTable(readTextFile(file).split(/\r?\n/), HISTORY_ANCHOR_HEADER)
  if (!table) return []
  const cells = table.rows.map((row) => row[0] ?? "")
  const issues: CheckIssue[] = []
  // 补零与「首列写了规则名」分开报：前者给出改法，避免混在同一条含糊告警里
  const padded = table.rowLines.filter((_, i) => isPaddedIdCell(cells[i] ?? ""))
  if (padded.length > 0) {
    const sample = cells.find((cell) => isPaddedIdCell(cell)) ?? ""
    issues.push({
      level: "warn",
      file: displayRel(tasksDir, file),
      line: (padded[0] ?? 0) + 1,
      message: `演进记录有 ${padded.length} 行首列为补零 ID（如 ${sample}，应写作 ${canonicalId(sample)}）：请人工核对（历史行只追加，不自动改写）`,
    })
  }
  const nonId = table.rowLines.filter((_, i) => !isIdCell(cells[i] ?? "") && !isPaddedIdCell(cells[i] ?? ""))
  if (nonId.length > 0) {
    issues.push({
      level: "warn",
      file: displayRel(tasksDir, file),
      line: (nonId[0] ?? 0) + 1,
      message: `演进记录有 ${nonId.length} 行首列不是稳定 ID（应记行内代码包裹的 C-<n>）：请人工核对补录（历史行只追加，不自动改写）`,
    })
  }
  return issues
}

