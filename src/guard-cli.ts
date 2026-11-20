// guard 独立入口：只带上作用域判定与包内正文读取，供 cli 入口按需加载
export { runGuard } from "./scope/guard"
