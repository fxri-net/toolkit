// 退出码单一真源：数值与含义只在本文件定义，命令实现与文档生成器均从此取数。
// 新增或调整退出码时先改这里，再跑 `scripts/generate-exit-codes.mjs` 同步文档，并由 `scripts/check-exit-codes.mjs` 阻止字面量回流。
export const EXIT = {
  OK: 0,
  FAIL: 1,
  INTERACTIVE: 2,
  // 用法错误与「需要交互但环境不支持」同码：skill lint 的参数非法沿用 2，文档中与 INTERACTIVE 合并说明
  USAGE: 2,
  GUARD_INACTIVE: 3,
  CANCEL: 130,
} as const

// 文档表行：code 为数值字面量，供生成器直接读取；与 EXIT 的一致性由单测锁定
export interface ExitCodeRow {
  code: number
  name: string
  meaning: string
  scene: string
}

export const EXIT_CODE_TABLE: readonly ExitCodeRow[] = [
  {
    code: 0,
    name: "OK",
    meaning: "成功（含 check 通过、归档跳过等正常路径）",
    scene: "全部命令",
  },
  {
    code: 1,
    name: "FAIL",
    meaning: "操作失败或校验存在 error 级问题（参数冲突、非法子命令、文件 / 目录异常等）",
    scene: "全部命令",
  },
  {
    code: 2,
    name: "INTERACTIVE / USAGE",
    meaning: "需要交互但当前环境不支持；或 skill lint 的用法错误（非法数值、空 --base 等）",
    scene: "wizard、写确认命令、skill lint 参数校验",
  },
  {
    code: 3,
    name: "GUARD_INACTIVE",
    meaning: "内容闸门判定当前目录未激活（stdout 为空，原因写 stderr）",
    scene: "scope guard",
  },
  {
    code: 130,
    name: "CANCEL",
    meaning: "用户在交互提示中按 Ctrl+C 中断（不写任何文件、不打印堆栈）",
    scene: "所有交互提示",
  },
]
