// 技能锁文件：为后续 --from 外部来源预留的版本锁定入口
// 本任务只放最小实现，不参与安装流程；读不到锁文件时返回 null，写入为空操作
import { existsSync } from "node:fs"
import { join } from "node:path"
import { readTextFile } from "../read-text"

// 技能锁文件名：与上游安装器的 skills-lock.json 分开命名
export const SKILLS_LOCK_FILE = ".toolkit-skills-lock.json"

// 锁文件路径：与全局状态文件同目录
export function skillsLockFile(home: string): string {
  return join(home, ".agents", SKILLS_LOCK_FILE)
}

// 读取锁文件：不存在或解析失败返回 null（当前无外部来源，恒按未锁定处理）
export function readSkillsLock(file: string): unknown | null {
  if (!existsSync(file)) return null
  try {
    return JSON.parse(readTextFile(file)) as unknown
  } catch {
    return null
  }
}
