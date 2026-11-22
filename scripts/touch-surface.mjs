// 用户可读文档触达面：三份根入口文件与文档站、技能包两个目录
// 验证脚本、规范一致性、文档无损与可读性检查共用同一份清单，避免各写一份后彼此漂移
export const TOUCH_FILES = ["README.md", "AGENTS.md", "SPEC.md"]
export const TOUCH_PREFIXES = ["docs/", "skills/"]

/**
 * 判断仓库根相对路径是否属于用户可读文档触达面。
 * @param {string} path 仓库根相对路径（兼容反斜杠）
 * @return {boolean} 是否触达
 */
export function isTouchPath(path) {
  const posix = path.replace(/\\/g, "/")
  return TOUCH_FILES.includes(posix) || TOUCH_PREFIXES.some((prefix) => posix.startsWith(prefix))
}
