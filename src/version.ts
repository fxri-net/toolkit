// npm registry 最新版本查询与版本号比较：网络请求与语义比较分离，便于单测注入
// 查询地址由调用方按配置 / 环境变量 / .npmrc 解析后传入，支持私有 registry 与 Bearer token
const REGISTRY_URL = "https://registry.npmjs.org/@fxri%2Ftoolkit/latest"

// 查询 registry 最新版本；网络失败、超时（1s）、响应异常一律返回 null（静默）
export async function fetchLatestVersion(url = REGISTRY_URL, token?: string): Promise<string | null> {
  try {
    const headers: Record<string, string> = { accept: "application/vnd.npm.install-v1+json" }
    if (token) headers.authorization = `Bearer ${token}`
    const res = await fetch(url, { signal: AbortSignal.timeout(1000), headers })
    if (!res.ok) return null
    const data = (await res.json()) as { version?: unknown }
    return typeof data.version === "string" ? data.version : null
  } catch {
    return null
  }
}

// 版本比较：a 严格大于 b 时返回 true
// 口径：段数不等按补零比较（0.2 等价 0.2.0）；预发布低于同号正式版（0.2.6-beta < 0.2.6）；
// 忽略构建元数据（+build）；任一侧无法解析为数字段版本一律返回 false（不可比，不猜测）
export function versionGt(a: string, b: string): boolean {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  if (!pa || !pb) return false
  const len = Math.max(pa.nums.length, pb.nums.length)
  for (let i = 0; i < len; i++) {
    const x = pa.nums[i] ?? 0
    const y = pb.nums[i] ?? 0
    if (x !== y) return x > y
  }
  return comparePrerelease(pa.pre, pb.pre) > 0
}

interface ParsedVersion {
  nums: number[]
  // null 表示正式版；数组表示预发布标识符
  pre: string[] | null
}

// 解析数字段版本；允许前导 v 与构建元数据，预发布后缀单独返回
function parseVersion(version: string): ParsedVersion | null {
  const matched = /^\s*v?(\d+(?:\.\d+)*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?\s*$/.exec(version)
  if (!matched) return null
  const nums = matched[1]!.split(".").map((part) => Number.parseInt(part, 10))
  if (nums.some((num) => !Number.isFinite(num))) return null
  return { nums, pre: matched[2] ? matched[2].split(".") : null }
}

// 预发布比较：正式版高于预发布；同为预发布按标识符逐段比较（数字小于字母）
function comparePrerelease(a: string[] | null, b: string[] | null): number {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const x = a[i]
    const y = b[i]
    // 标识符少的一方优先级低（1.0.0-alpha < 1.0.0-alpha.1）
    if (x === undefined) return -1
    if (y === undefined) return 1
    const nx = /^\d+$/.test(x)
    const ny = /^\d+$/.test(y)
    if (nx && ny) {
      const diff = Number(x) - Number(y)
      if (diff !== 0) return diff > 0 ? 1 : -1
      continue
    }
    // 纯数字标识符优先级低于字母标识符
    if (nx !== ny) return nx ? -1 : 1
    if (x !== y) return x > y ? 1 : -1
  }
  return 0
}
