// 任务文件名简述的单一实现：建档命名（导入）、tasks check 与 tasks archive 共用，避免各自一套口径
// 口径：简述由正文标题派生（NFC 归一、替换非法字符、空白折叠为 `-`），不翻译、不音译、不缩写；
// 判据只看文字重合，不绑定语种——中文标题自然得中文名，英文项目自然得英文名

// 跨平台文件名非法字符（Windows 与 POSIX 并集）与控制字符（\p{Cc}）：生成时按空白替换，避免产出不可移植的文件名
const ILLEGAL_CHARS_RE = /[\\/:*?"<>|\p{Cc}]/gu
// Windows 保留设备名（大小写不敏感）：命中即逐字不可用，即便只是简述也一并提示
const RESERVED_NAMES = new Set([
  "CON", "PRN", "AUX", "NUL",
  "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
  "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
])
// 派生简述的长度上限（字符数）：控制文件名可读性，与导入现状一致
const BRIEF_MAX = 24
// 校验用长度上限（字符数）：超出即提示可读性与跨平台路径预算（派生截断不按此值）
const BRIEF_WARN_MAX = 60
// 同源判据的字符覆盖率兜底阈值：允许人工从标题里挑关键词压缩，但不允许整体改写
const COVERAGE_MIN = 0.8

// 由标题派生文件名简述：去非法字符 → 空白折叠为 `-` → 截断；标题全被过滤时回退「任务」
export function taskBrief(title: string): { brief: string; truncated: boolean } {
  const clean = title.normalize("NFC").replace(ILLEGAL_CHARS_RE, " ").replace(/\s+/g, " ").trim()
  const truncated = clean.length > BRIEF_MAX
  const brief = clean.slice(0, BRIEF_MAX).trim().replace(/\s+/g, "-").replace(/[.\s]+$/, "")
  return { brief: brief || "任务", truncated }
}

// 比对用归一：NFC + 小写折叠 + 去掉标点 / 符号 / 空白，只保留文字与数字
function fold(text: string): string {
  return text.normalize("NFC").toLowerCase().replace(/[\p{P}\p{S}\p{Z}\s]+/gu, "")
}

// 简述是否源出标题：归一后为标题子串（截断即前缀），否则按字符覆盖率兜底（人工精简写法）
export function briefMatchesTitle(brief: string, title: string): boolean {
  const briefFolded = fold(brief)
  const titleFolded = fold(title)
  // 任一侧为空时不判定，缺失由其它校验负责
  if (!briefFolded || !titleFolded) return true
  if (titleFolded.includes(briefFolded)) return true
  // 字符池按多重集扣除，避免重复字符虚增覆盖率
  const pool = new Map<string, number>()
  for (const ch of titleFolded) pool.set(ch, (pool.get(ch) ?? 0) + 1)
  let hit = 0
  for (const ch of briefFolded) {
    const left = pool.get(ch) ?? 0
    if (left > 0) {
      hit += 1
      pool.set(ch, left - 1)
    }
  }
  return hit / [...briefFolded].length >= COVERAGE_MIN
}

// 简述的文件名形态问题：与语种无关，只按目标文件系统约束判定
export function briefNameIssues(brief: string): string[] {
  const issues: string[] = []
  const illegal = [...new Set(brief.match(ILLEGAL_CHARS_RE) ?? [])]
  if (illegal.length > 0) issues.push(`含文件名非法字符 ${illegal.map((c) => `「${c}」`).join("")}`)
  if (brief !== brief.normalize("NFC")) issues.push("未做 NFC 归一（部分系统会视为不同文件名）")
  if (/[.\s]$/.test(brief)) issues.push("以点或空格结尾（Windows 会自动截断）")
  const base = brief.split(".")[0] ?? ""
  if (RESERVED_NAMES.has(base.toUpperCase())) issues.push("与 Windows 保留设备名同名")
  if ([...brief].length > BRIEF_WARN_MAX) issues.push(`超过 ${BRIEF_WARN_MAX} 字符（影响可读性与跨平台路径预算）`)
  return issues
}

// 文件名三段解析（入参可带 .md）：结构不符返回 null，结构问题交由既有命名告警负责
export function parseTaskName(fileStem: string): { date: string; owner: string; brief: string } | null {
  const stem = fileStem.endsWith(".md") ? fileStem.slice(0, -3) : fileStem
  const matched = /^(\d{8})-([^-]+)-(.+)$/.exec(stem)
  if (!matched) return null
  return { date: matched[1] ?? "", owner: matched[2] ?? "", brief: matched[3] ?? "" }
}
