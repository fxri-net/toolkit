// 原子写文件：先写同目录临时文件再 rename，降低写一半进程崩溃产生半截文件的风险
import { writeFileSync, renameSync } from "node:fs"
import { dirname, join } from "node:path"

export function writeFileAtomic(file: string, content: string | Buffer): void {
  const tmp = join(dirname(file), `.tmp-${process.pid}-${Date.now().toString(36)}`)
  writeFileSync(tmp, content)
  renameSync(tmp, file)
}
