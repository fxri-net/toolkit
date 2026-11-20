// 内容闸门 guard：按当前目录作用域决定是否下发技能正文
// stdout 只放正文（未激活时为空），原因与诊断一律走 stderr；只读，不写缓存
import { existsSync } from "node:fs"
import { join } from "node:path"
import { readTextFile } from "../read-text"
import { skillsSourceDir } from "../skills/source/package"
import { SKILL_ENTRY } from "../skills/types"
import { resolveScope, type ScopeReport } from "./load"

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

// 技能名校验并取包内真源目录：非法名与包内不存在的名字分别报错
// 按名字直取目录，不扫描全部技能，保证 guard 的启动成本只与单个技能相关
export function packageSkillDir(name: string): string {
  if (!SKILL_NAME_RE.test(name)) throw new Error(`技能名非法：${name}（只允许单段名字，不含路径分隔符）`)
  const dir = join(skillsSourceDir(), name)
  if (!existsSync(join(dir, SKILL_ENTRY))) throw new Error(`包内不存在技能：${name}`)
  return dir
}

// 解析 guard 结果：激活时读取正文，未激活时给出原因（不做任何写操作）
export function resolveGuard(name: string, startDir = process.cwd()): GuardResult {
  const skillDir = packageSkillDir(name)
  const report = resolveScope(startDir)
  if (!report.decision.active) {
    return { name, active: false, content: "", skillDir, referencesDir: "", reason: report.decision.reason, report }
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
