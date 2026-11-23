// 内容闸门 guard：按当前目录作用域决定是否下发技能正文
// stdout 只放正文（未激活时为空），原因与诊断一律走 stderr；只读，不写缓存
import { existsSync } from "node:fs"
import { basename, join } from "node:path"
import { readTextFile } from "../read-text"
import { skillsSourceDir } from "../skills/source/package"
import { readSkillsState } from "../skills/state"
import { PROJECT_SOURCE_DIR, SKILL_ENTRY } from "../skills/types"
import { resolveScope, type ScopeReport } from "./load"
import { findProjectRoot } from "./paths"

// 技能名约束：单段名字，禁止路径分隔符与点段，避免借技能名穿越到包外
const SKILL_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

export interface GuardResult {
  name: string
  // 当前目录是否激活
  active: boolean
  // active 时为技能正文，inactive 时为空串
  content: string
  // 包内技能目录（含 references / assets 的读取基准）
  skillDir: string
  // 包内参考文件目录；技能未提供 references 时为空串
  referencesDir: string
  // inactive 时的原因文案
  reason: string
  report: ScopeReport
}

// 外部来源技能目录：按状态文件登记的来源根解析；内置源没有时才会走到这里
function externalSkillDir(name: string): string | null {
  const state = readSkillsState()
  if (!state) return null
  for (const source of Object.values(state.sources)) {
    if (source.kind === "builtin" || !source.root) continue
    const candidates = [join(source.root, name), join(source.root, "skills", name)]
    for (const dir of candidates) {
      if (existsSync(join(dir, SKILL_ENTRY))) return dir
    }
    // 来源根本身就是单个技能目录
    if (basename(source.root) === name && existsSync(join(source.root, SKILL_ENTRY))) return source.root
  }
  return null
}

// 技能名校验并取真源目录：先查内置包，再查已登记的外部来源
// 按名字直取目录，不扫描全部技能，保证 guard 的启动成本只与单个技能相关
export function packageSkillDir(name: string): string {
  if (!SKILL_NAME_RE.test(name)) throw new Error(`技能名非法：${name}（只允许单段名字，不含路径分隔符）`)
  const builtin = join(skillsSourceDir(), name)
  if (existsSync(join(builtin, SKILL_ENTRY))) return builtin
  const external = externalSkillDir(name)
  if (external) return external
  throw new Error(`未找到技能：${name}（内置源与已登记来源均不存在）`)
}

// 项目真源副本：仓库内 .agents/skills/<name> 存在时优先读取，保证项目面入口壳与正文同源
function projectSkillDir(name: string, startDir: string): string | null {
  const dir = join(findProjectRoot(startDir), PROJECT_SOURCE_DIR, name)
  return existsSync(join(dir, SKILL_ENTRY)) ? dir : null
}

// 解析 guard 结果：激活时读取正文，未激活时给出原因（不做任何写操作）
export function resolveGuard(name: string, startDir = process.cwd()): GuardResult {
  // 项目面优先取仓库内真源副本；仓库内无该技能时回落包内 / 外部来源
  const skillDir = projectSkillDir(name, startDir) ?? packageSkillDir(name)
  const report = resolveScope(startDir, name)
  // 策略声明该目录不安装时与未激活同口径：stdout 为空、按未激活退出码结束
  const unavailable = !report.decision.active || report.decision.delivery === "off"
  if (unavailable) {
    const reason = report.decision.active ? "策略声明该目录不安装该技能" : report.decision.reason
    return { name, active: false, content: "", skillDir, referencesDir: "", reason, report }
  }
  const referencesDir = join(skillDir, "references")
  return {
    name,
    active: true,
    content: readTextFile(join(skillDir, SKILL_ENTRY)),
    skillDir,
    referencesDir: existsSync(referencesDir) ? referencesDir : "",
    reason: report.decision.reason,
    report,
  }
}

// 执行 guard 命令并返回退出码：0 激活、3 未激活、1 技能名非法或读取失败
// stdout 只放正文，参考文件目录与未激活原因走 stderr
export function runGuard(name: string): number {
  let result: GuardResult
  try {
    result = resolveGuard(name)
  } catch (error) {
    console.error(`⚠️ ${(error as Error).message}`)
    return 1
  }
  for (const warning of result.report.warnings) console.error(`⚠️ ${warning}`)
  if (!result.active) {
    console.error(`技能 ${name} 未在当前目录激活：${result.reason}`)
    console.error("可用 toolkit scope status 查看当前目录的判定与原因")
    return 3
  }
  process.stdout.write(result.content)
  console.error(`参考文件目录：${result.referencesDir || result.skillDir}`)
  return 0
}
