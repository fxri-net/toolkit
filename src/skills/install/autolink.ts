// 技能安装与卸载（autolink）：自 install.ts 按面拆分，逻辑逐字未改
import { existsSync, readdirSync, symlinkSync } from "node:fs"
import { join } from "node:path"
import { getConfigSection } from "../../config"
import { isCiEnv } from "../../update-check"
import { classifyExisting, removeArtifact, skillsLinkDir, skillsSourceDir } from "../source"
import { readSkillsState, writeSkillsState } from "../state"
import { STATE_FORMAT, STATE_SCHEMA_VERSION, type SkillStateSource, type SkillStateTarget } from "../types"


export function autoLinkSkills(): number {
  const section = getConfigSection("skills")
  if (section?.autoLink === false) return 0
  if (isCiEnv()) return 0
  const state = readSkillsState()
  if (!state) return 0

  // 真源技能名集合：一次列目录替代循环内逐条探活，且只收真实存在（可解析）的名字
  const sourceRoot = skillsSourceDir()
  let sourceNames: Set<string>
  try {
    sourceNames = new Set(readdirSync(sourceRoot).filter((name) => existsSync(join(sourceRoot, name))))
  } catch {
    return 0
  }

  // 期望链接目标：稳定锚点（升级时锚点由 pnpm 重写，链接不随版本段失效）
  const linkDir = skillsLinkDir()
  const replaceForeign = section?.autoLinkReplaceForeign !== false
  const linkType = process.platform === "win32" ? "junction" : "dir"

  let repaired = 0
  const nextSources: Record<string, SkillStateSource> = {}
  for (const [sourceName, source] of Object.entries(state.sources)) {
    const nextTargets: SkillStateTarget[] = []
    for (const target of source.targets) {
      let dirents
      try {
        dirents = readdirSync(target.dir, { withFileTypes: true })
      } catch {
        nextTargets.push(target)
        continue
      }
      const present = new Map(dirents.map((dirent) => [dirent.name, dirent]))
      const entries = target.entries.filter((entry) => {
        // 非链接形态不参与自愈；已不在包内则剔除记录
        if (entry.mode !== "link") return sourceNames.has(entry.name)
        if (!sourceNames.has(entry.name)) return false
        const linkTarget = join(linkDir, entry.name)
        const dest = join(target.dir, entry.name)
        const dirent = present.get(entry.name)
        const kind = dirent ? classifyExisting(dest, linkTarget, dirent) : "absent"
        if (kind === "link-ok") return true
        // 非替换模式：现场是实体目录/普通文件时一律不动，记录照留（用户可显式 install --force 处置）
        if (!replaceForeign && (kind === "dir" || kind === "file")) return true
        // 悬空或指向其他版本：删链重建；实体目录/文件按开关先清理
        try {
          if (kind !== "absent") removeArtifact(dest)
          symlinkSync(linkTarget, dest, linkType)
          repaired += 1
          return true
        } catch {
          // 重建失败不改记账：本条仍是本包登记的产物，留着下次再试
          return true
        }
      })
      nextTargets.push({ ...target, entries })
    }
    nextSources[sourceName] = { ...source, targets: nextTargets }
  }
  if (repaired > 0) writeSkillsState({ format: STATE_FORMAT, schemaVersion: STATE_SCHEMA_VERSION, updatedAt: new Date().toISOString(), sources: nextSources })
  return repaired
}
