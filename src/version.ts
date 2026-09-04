// npm registry 最新版本查询与版本号比较：网络请求与语义比较分离，便于单测注入
const REGISTRY_URL = "https://registry.npmjs.org/@fxri%2Ftoolkit/latest"

// 查询 registry 最新版本；网络失败、超时（1s）、响应异常一律返回 null（静默）
export async function fetchLatestVersion(): Promise<string | null> {
  try {
    const res = await fetch(REGISTRY_URL, {
      signal: AbortSignal.timeout(1000),
      headers: { accept: "application/vnd.npm.install-v1+json" },
    })
    if (!res.ok) return null
    const data = (await res.json()) as { version?: unknown }
    return typeof data.version === "string" ? data.version : null
  } catch {
    return null
  }
}

// 版本比较：a 严格大于 b 时返回 true（仅比较数值段，忽略 prerelease 后缀）
export function versionGt(a: string, b: string): boolean {
  const parse = (v: string): number[] =>
    v
      .trim()
      .replace(/^-/, "")
      .split(/[.+-]/)
      .map((p) => Number.parseInt(p, 10))
      .map((n) => (Number.isFinite(n) ? n : 0))
  const pa = parse(a)
  const pb = parse(b)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x !== y) return x > y
  }
  return false
}
