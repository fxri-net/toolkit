// 分发形态解释：统一组装配置、技能声明与策略，供文本与 JSON 输出共用一份实现
import { existsSync } from "node:fs"
import { join } from "node:path"
import { readSkillsDeliveryConfig } from "./config"
import { explainDelivery, type DeliveryExplanation } from "./delivery"
import { derivePolicyDelivery, loadPolicyDeliveryContext } from "./policy-delivery"
import { listPackageSkills, readSkillDelivery, readSkillGate } from "./source"
import { readSkillsState } from "./state"
import { SKILL_ENTRY } from "./types"

// 技能声明目录：内置包优先，其次状态登记的外部来源根
function skillMetadataDir(name: string): string | undefined {
  const builtin = listPackageSkills().find((item) => item.name === name)
  if (builtin) return builtin.dir
  const state = readSkillsState()
  for (const source of Object.values(state?.sources ?? {})) {
    if (source.kind === "builtin" || !source.root) continue
    for (const dir of [join(source.root, name), join(source.root, "skills", name)]) {
      if (existsSync(join(dir, SKILL_ENTRY))) return dir
    }
  }
  return undefined
}

// 解释指定技能：逐级命中 / 未命中、被压规则与最终结论
export function explainSkillDelivery(name: string, startDir = process.cwd()): DeliveryExplanation {
  const dir = skillMetadataDir(name)
  return explainDelivery({
    name,
    config: readSkillsDeliveryConfig("global", startDir),
    gate: dir ? readSkillGate(dir) : undefined,
    packageDefault: dir ? readSkillDelivery(dir) : undefined,
    policy: derivePolicyDelivery(name, loadPolicyDeliveryContext(startDir)),
  })
}
