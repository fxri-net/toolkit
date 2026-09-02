import { readFileSync, writeFileSync } from "node:fs"
import { collectChangelogs } from "./collect"
import { redactText } from "../privacy/redact"
import type { ChangelogLanguage } from "./languages"

// 生成本地时区日期 YYYY-MM-DD
export function localDate(): string {
  const now = new Date()
  const p = (n: number) => String(n).padStart(2, "0")
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

// 格式化单个 CHANGELOG 文件，返回是否有改动
export function formatChangelog(file: string, today: string, lang: ChangelogLanguage, redact = true): boolean {
  const raw = readFileSync(file, "utf8")
  // 记录原换行符（LF/CRLF），统一按 LF 处理后原样还原，避免 Windows 下出现混合换行
  const eol = raw.includes("\r\n") ? "\r\n" : "\n"
  // 归一化后的原始内容作为「是否有净改动」的判定基线
  const baseline = raw.replace(/\r\n/g, "\n")
  let content = baseline
  // 标题替换（多语言）
  for (const [from, to] of Object.entries(lang.replacements)) {
    content = content.replaceAll(from, to)
  }
  // 合并连续重复的「依赖更新」
  while (content.includes(`${lang.deps}\n${lang.deps}`)) {
    content = content.replace(`${lang.deps}\n${lang.deps}`, lang.deps)
  }
  // 合并任意位置连续完全相同的条目（/m 使 ^、$ 按行生效）
  while (true) {
    const merged = content.replace(/^- (.+)\n- \1$/gm, "- $1")
    if (merged === content) break
    content = merged
  }
  // 版本标题下补发布日期：已存在的日期行（紧跟标题或隔空行）保留，缺失时才补今日
  const lines = content.split("\n")
  const result: string[] = []
  for (let i = 0; i < lines.length; i++) {
    result.push(lines[i])
    if (/^## \d+\.\d+\.\d+/.test(lines[i])) {
      // 跳过标题后的空行，取首个非空行判断是否已带日期标记
      let j = i + 1
      while (j < lines.length && lines[j].trim() === "") j++
      const hasDate =
        lines[j]?.startsWith("> ") && /^> \d{4}-\d{2}-\d{2} (?:发布|released)$/.test(lines[j].trim())
      if (!hasDate) result.push(`> ${today} ${lang.released}`)
    }
  }
  const next = result.join("\n")
  // 写回前对变更条目等自由文本脱敏（redact=false 时原样返回）
  const output = redactText(next, redact)
  if (output !== baseline) {
    writeFileSync(file, output.replace(/\n/g, eol), "utf8")
    return true
  }
  return false
}

// 格式化目录下所有 CHANGELOG.md
export function formatChangelogs(dir: string, today: string, lang: ChangelogLanguage, redact = true): string[] {
  const changed: string[] = []
  for (const file of collectChangelogs(dir)) {
    if (formatChangelog(file, today, lang, redact)) changed.push(file)
  }
  if (changed.length === 0) {
    console.log("无 CHANGELOG 需要更新")
  } else {
    for (const file of changed) console.log(`changelog 已更新：${file}`)
  }
  return changed
}
