// Vite 资源导入声明：根项目与 docs 项目共用，避免 IDE 只加载其中一个 tsconfig 时报 2307
declare module "*.css" {}

declare module "*.vue" {
  import type { DefineComponent } from "vue"
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}
