// 展示路径统一收口：相对任务目录并统一 / 分隔，避免跨平台输出混用反斜杠（import/export/CLI 共用）
import { relative, sep } from "node:path"

export function displayRel(tasksDir: string, file: string): string {
  return relative(tasksDir, file).split(sep).join("/")
}
