import { resolve } from "node:path"
import { walkFiles, type ScopeOptions } from "../fs-scope"

// 收集选项沿用遍历范围口径，字段与 ScopeOptions 一致
export type CollectOptions = ScopeOptions

// 递归收集目录下属于本仓自身的 CHANGELOG.md：
// 跳过依赖安装目录、构建产物、版本库元数据，以及 gitignore 覆盖的目录；
// 判据不看文件是否被 git 跟踪——把 vendor 提交进版本库的项目同样不应改写第三方包的日志
export function collectChangelogs(dir: string, options: CollectOptions = {}): string[] {
  return walkFiles(resolve(dir), (name) => name === "CHANGELOG.md", options)
}
