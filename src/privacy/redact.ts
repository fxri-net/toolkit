// 隐私脱敏：内置掩码规则 + 项目根 .toolkitrc.json 自定义规则
// 自定义规则追加（且优先于内置），可用 disable 按 name 禁用内置规则；enabled=false 时整体关闭
import { getConfigSection } from "../config"
import { resolveEnabled } from "../switch"

interface RedactRule {
  name: string
  pattern: RegExp
  replacement: string
}

interface CustomRule {
  name: string
  pattern: string
  flags?: string
  replacement: string
}

interface RedactConfig {
  enabled?: boolean
  disable?: string[]
  rules?: CustomRule[]
}

// 内置掩码规则（按「特定优先」排序，先处理 URL/密钥等长结构，避免被通用数字规则误伤）
const BUILTIN_RULES: RedactRule[] = [
  // 内网/含端口 URL：掩码域名主体，保留端口与路径
  {
    name: "内网URL",
    pattern: /(https?:\/\/)[a-zA-Z0-9.-]+(:\d{2,5})(?=\/|[\s]|$)/g,
    replacement: "$1***$2",
  },
  // 邮箱：保留首字符与顶级域，掩码用户名主体与域名
  {
    name: "邮箱",
    pattern: /([a-zA-Z0-9._%+-])[a-zA-Z0-9._%+-]*@(?:[a-zA-Z0-9-]+\.)+([a-zA-Z]{2,})/g,
    replacement: "$1***@***.$2",
  },
  // JWT：保留 eyJ 头标记，掩码载荷（仅头段需 eyJ 前缀，载荷/签名允许任意 base64url）
  {
    name: "JWT",
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    replacement: "eyJ***.***.***",
  },
  // AWS Access Key：保留前缀标识
  { name: "AWS密钥", pattern: /\b(AKIA|ASIA)[A-Z0-9]{16}\b/g, replacement: "$1****" },
  // GitHub Token：经典格式（ghp/gho/ghu/ghs/ghr + 36 位）
  { name: "GitHub密钥", pattern: /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/g, replacement: "$1_****" },
  // GitHub Token：细粒度格式（github_pat_ + 82 位，形如 22 位 + 下划线 + 59 位）
  { name: "GitHub细粒度密钥", pattern: /\bgithub_pat_[A-Za-z0-9_]{80,}\b/g, replacement: "github_pat_****" },
  // OpenAI API Key：经典格式（sk- + 48 位）
  { name: "OpenAI密钥", pattern: /\bsk-[A-Za-z0-9]{20,}\b/g, replacement: "sk-****" },
  // OpenAI API Key：项目格式（sk-proj- + 40 位以上，允许连字符）
  { name: "OpenAI项目密钥", pattern: /\bsk-proj-[A-Za-z0-9_-]{40,}\b/g, replacement: "sk-proj-****" },
  // Slack Token：xox 系（bot/user/app 等，xox[baprs]）
  { name: "Slack密钥", pattern: /\b(xox[baprs])-[A-Za-z0-9-]{10,}\b/g, replacement: "$1-****" },
  // Slack Token：app 级（xapp-<workspace>-<id>-<secret> 长串）
  { name: "Slack应用令牌", pattern: /\bxapp-\d+-[A-Za-z0-9-]{15,}\b/g, replacement: "xapp-****" },
  // 手机号（中国 1xx）：保留前 3 后 4
  { name: "手机号", pattern: /(?<!\d)(1[3-9]\d)\d{4}(\d{4})(?!\d)/g, replacement: "$1****$2" },
  // 身份证号（18 位）：保留前 6 后 4
  { name: "身份证", pattern: /(?<!\d)(\d{6})\d{8}(\d{3}[\dXx])(?!\d)/g, replacement: "$1********$2" },
  // IPv4：保留前两段（四段才命中，版本号 1.0.1 三段不误伤）
  { name: "IPv4", pattern: /(?<![\d.])(\d{1,3}\.\d{1,3})\.\d{1,3}\.\d{1,3}(?![\d.])/g, replacement: "$1.***.***" },
]

// 规则缓存（自定义规则 + 内置规则合成后的结果）
let cachedRules: RedactRule[] | null = null

// 读取 .toolkitrc.json 的 redact 段（配置加载与缓存由 config.ts 统一处理）
function loadConfig(): RedactConfig | null {
  const section = getConfigSection("redact")
  if (!section) return null
  return {
    enabled: typeof section.enabled === "boolean" ? section.enabled : undefined,
    disable: Array.isArray(section.disable) ? (section.disable.filter((x) => typeof x === "string") as string[]) : undefined,
    rules: Array.isArray(section.rules) ? (section.rules as CustomRule[]) : undefined,
  }
}

// 合成最终规则集：自定义规则优先，内置规则可按 name 禁用
function getRules(): RedactRule[] {
  if (cachedRules) return cachedRules
  const cfg = loadConfig()
  const disabled = new Set(cfg?.disable ?? [])
  const custom: RedactRule[] = []
  for (const r of cfg?.rules ?? []) {
    try {
      custom.push({ name: r.name, pattern: new RegExp(r.pattern, r.flags ?? ""), replacement: r.replacement })
    } catch {
      // 单条规则正则非法：跳过，不影响其余规则
    }
  }
  cachedRules = [...custom, ...BUILTIN_RULES.filter((r) => !disabled.has(r.name))]
  return cachedRules
}

// 按需对文本脱敏（enabled=false 原样返回）
export function redactText(text: string, enabled: boolean): string {
  if (!enabled || !text) return text
  let out = text
  for (const rule of getRules()) {
    out = out.replace(rule.pattern, rule.replacement)
  }
  return out
}

// 解析脱敏总开关：CLI > 环境变量 FX_REDACT > 配置 enabled > 默认开启（双向，见 switch.resolveEnabled）
export function resolveRedactEnabled(cliEnabled: boolean | undefined): boolean {
  return resolveEnabled(cliEnabled, "FX_REDACT", loadConfig()?.enabled, true)
}
