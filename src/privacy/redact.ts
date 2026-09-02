// 隐私脱敏：内置掩码规则 + 项目根 .toolkitrc.json 自定义规则
// 自定义规则追加（且优先于内置），可用 disable 按 name 禁用内置规则；enabled=false 时整体关闭
import { readFileSync } from "node:fs"
import { join } from "node:path"

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
  // JWT：保留结构分段，掩码载荷
  {
    name: "JWT",
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    replacement: "eyJ***.eyJ***.***",
  },
  // AWS Access Key：保留前缀标识
  { name: "AWS密钥", pattern: /\b(AKIA|ASIA)[A-Z0-9]{16}\b/g, replacement: "$1****" },
  // GitHub Token：保留类型前缀
  { name: "GitHub密钥", pattern: /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/g, replacement: "$1_****" },
  // OpenAI API Key
  { name: "OpenAI密钥", pattern: /\bsk-[A-Za-z0-9]{20,}\b/g, replacement: "sk-****" },
  // Slack Token：保留 xox 前缀
  { name: "Slack密钥", pattern: /\b(xox[baprs])-[A-Za-z0-9-]{10,}\b/g, replacement: "$1-****" },
  // 手机号（中国 1xx）：保留前 3 后 4
  { name: "手机号", pattern: /(?<!\d)(1[3-9]\d)\d{4}(\d{4})(?!\d)/g, replacement: "$1****$2" },
  // 身份证号（18 位）：保留前 6 后 4
  { name: "身份证", pattern: /(?<!\d)(\d{6})\d{8}(\d{3}[\dXx])(?!\d)/g, replacement: "$1********$2" },
  // IPv4：保留前两段（四段才命中，版本号 1.0.1 三段不误伤）
  { name: "IPv4", pattern: /(?<![\d.])(\d{1,3}\.\d{1,3})\.\d{1,3}\.\d{1,3}(?![\d.])/g, replacement: "$1.***.***" },
]

// 配置缓存：undefined=未加载，null=无配置文件
let cachedConfig: RedactConfig | null | undefined
let cachedRules: RedactRule[] | null = null

// 读取项目根 .toolkitrc.json 的 redact 段，文件缺失或解析失败返回 null
function loadConfig(): RedactConfig | null {
  if (cachedConfig !== undefined) return cachedConfig
  cachedConfig = null
  try {
    const raw = readFileSync(join(process.cwd(), ".toolkitrc.json"), "utf8")
    const json = JSON.parse(raw) as { redact?: RedactConfig }
    cachedConfig = json.redact ?? null
  } catch {
    // 无配置文件或 JSON 非法：忽略，走内置规则
  }
  return cachedConfig
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

// 解析脱敏总开关：CLI --no-redact > 环境变量 FX_REDACT=0 > 配置 enabled=false > 默认开启
export function resolveRedactEnabled(args: string[]): boolean {
  if (args.includes("--no-redact")) return false
  if (process.env.FX_REDACT === "0") return false
  if (loadConfig()?.enabled === false) return false
  return true
}
