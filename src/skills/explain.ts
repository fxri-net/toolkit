// 分发形态解释：统一组装配置、技能声明与策略，供文本与 JSON 输出共用一份实现
import { readSkillsDeliveryConfig } from "./config"
import { explainDelivery, type DeliveryExplanation } from "./delivery"
import { derivePolicyDelivery, loadPolicyDeliveryContext } from "./policy-delivery"
import { listPackageSkills } from "./source"

// 解释指定技能：逐级命中 / 未命中、被压规则与最终结论
export function explainSkillDelivery(name: string, startDir = process.cwd()): DeliveryExplanation {
  const skill = listPackageSkills().find((item) => item.name === name)
  return explainDelivery({
    name,
    config: readSkillsDeliveryConfig("global", startDir),
    gate: skill?.gate,
    packageDefault: skill?.delivery,
    policy: derivePolicyDelivery(name, loadPolicyDeliveryContext(startDir)),
  })
}
