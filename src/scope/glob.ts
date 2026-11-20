// 作用域 glob：只实现最小子集（** / * / ?），其余字符按字面匹配；不引入运行时依赖
import { normalizePathForCompare } from "../git-ignore"

// 把 glob 编译为正则：**/ 允许跨层且可零层，* 与 ? 不跨路径分隔符
export function globToRegExp(pattern: string, caseInsensitive = false): RegExp {
  // 结尾 /** 表示「目录自身及其下任意层级」，单独处理以允许 /home/u/work 本身命中
  const suffix = pattern.endsWith("/**") ? "(?:/.*)?" : ""
  const source = suffix ? pattern.slice(0, -3) : pattern
  let compiled = ""
  for (let index = 0; index < source.length; index += 1) {
    const char = source.charAt(index)
    if (char === "*") {
      if (source.charAt(index + 1) === "*") {
        // ** 后紧跟 / 时允许零层目录
        if (source.charAt(index + 2) === "/") {
          compiled += "(?:.*/)?"
          index += 2
        } else {
          compiled += ".*"
          index += 1
        }
      } else {
        compiled += "[^/]*"
      }
      continue
    }
    if (char === "?") {
      compiled += "[^/]"
      continue
    }
    compiled += char.replace(/[.+^${}()|[\]\\]/g, "\\$&")
  }
  return new RegExp(`^${compiled}${suffix}$`, caseInsensitive ? "i" : "")
}

// 判定路径是否命中 glob：两侧统一分隔符与大小写口径后再比较
export function matchGlob(path: string, pattern: string, caseInsensitive = false): boolean {
  const target = normalizePathForCompare(path)
  const normalizedPattern = normalizePathForCompare(pattern)
  return globToRegExp(normalizedPattern, caseInsensitive).test(target)
}
