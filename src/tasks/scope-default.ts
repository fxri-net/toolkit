// 影响范围默认值：沿用项目内最近一条任务的范围（含归档），读不到时回落 cli
import { listActiveTasks, listArchivedTasks } from "./query"

export function inferScopeDefault(tasksDir = ".tasks"): string {
  const rows = [...listActiveTasks(tasksDir), ...listArchivedTasks(tasksDir)]
    .filter((row) => row.scope && row.scope !== "-")
    .sort((a, b) => b.created.localeCompare(a.created))
  return rows[0]?.scope ?? "cli"
}
