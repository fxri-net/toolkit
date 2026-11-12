// 文档站校验共用类型：导航与产物两条命令输出同一套问题结构，便于门禁与 JSON 消费统一处理

// 问题级别：error 阻断（退出码 1），warn 只提示
export type ProblemLevel = "error" | "warn"

// 单条问题：id 为规则标识（如 nav/max-items），file 为仓库根相对路径
export interface DocsProblem {
  id: string
  level: ProblemLevel
  file: string
  message: string
}
