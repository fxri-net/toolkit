<script setup lang="ts">
// 规则组合器：模块选择、拖拽排序、实时预览、一键复制与本机记忆
import { computed, onMounted, ref } from "vue"
import { composeModules, type RuleModule } from "../../../../src/rules/core"
import { RULESET, RULE_MODULES } from "./rules.generated"

const STORAGE_KEY = "fxri-toolkit:rules:v1"
const presets = RULESET.presets
const presetNames = Object.keys(presets)
const presetLabels: Record<string, string> = { minimal: "极简", recommended: "推荐", complete: "AI 全篇", full: "全量" }

// 模块正文与元数据：首行锚点单独解析，正文交给共享组合函数，避免前端重写拼接逻辑
const modules: Array<RuleModule & { title: string; summary: string; presets: string[] }> = RULESET.modules.map((meta) => {
  const raw = RULE_MODULES[meta.id] ?? ""
  const lines = raw.replace(/\r\n/g, "\n").split("\n")
  const anchor = (lines[0] ?? "").trim().replace(/^> 规则更新时间\s+/, "")
  return {
    id: meta.id,
    title: meta.title,
    summary: meta.summary,
    anchor,
    body: lines.slice(1).join("\n").trim(),
    presets: presetNames.filter((name) => presets[name]?.includes(meta.id)),
  }
})
const byId = new Map(modules.map((mod) => [mod.id, mod]))

const selected = ref<string[]>([...(presets.recommended ?? [])])
const activePreset = ref("recommended")
const copied = ref(false)
const copyError = ref(false)
const storageAvailable = ref(true)
const dragId = ref<string | null>(null)

const selectedModules = computed(() => selected.value.map((id) => byId.get(id)).filter(Boolean) as typeof modules)
const composed = computed(() => {
  try {
    return composeModules(modules, selected.value)
  } catch {
    return ""
  }
})
const latest = computed(() => selectedModules.value.map((mod) => mod.anchor).sort().pop() ?? "")
const envHint = computed(() => selected.value.includes("env") && !selected.value.includes("workflow"))
const cliCommand = computed(() => `toolkit rules compose ${selected.value.map((id) => `--module ${id}`).join(" ")}`)
const charCount = computed(() => composed.value.length)

// 记住选择（仅模块有序列表）；存储不可用时只在本次会话内保留
function persist(): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ schema: 1, modules: selected.value }))
    storageAvailable.value = true
    return true
  } catch {
    storageAvailable.value = false
    return false
  }
}

// 清除本机记忆：存储被禁用时 removeItem 也可能抛错，必须单独兜住
function clearStored(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
    storageAvailable.value = true
  } catch {
    storageAvailable.value = false
  }
}

// 恢复选择：schema 不符、含未知模块或空列表时清除并回落推荐
function restore(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as { schema?: number; modules?: unknown }
    const ids = Array.isArray(parsed.modules)
      ? [...new Set(parsed.modules.filter((id): id is string => typeof id === "string" && byId.has(id)))]
      : []
    if (parsed.schema !== 1 || ids.length === 0) throw new Error("缓存结构不兼容")
    selected.value = ids
    activePreset.value =
      presetNames.find((name) => (presets[name] ?? []).join("|") === ids.join("|")) ?? "custom"
  } catch {
    clearStored()
  }
}
onMounted(restore)

function toggle(id: string, checked: boolean): void {
  selected.value = checked ? [...selected.value, id] : selected.value.filter((item) => item !== id)
  activePreset.value = "custom"
  persist()
}

// 预设只负责补选与按预设顺序重排，不丢弃用户额外勾选的模块
function applyPreset(name: string): void {
  const base = presets[name] ?? []
  const extras = selected.value.filter((id) => !base.includes(id))
  selected.value = [...base, ...extras]
  activePreset.value = extras.length > 0 ? "custom" : name
  persist()
}

function move(id: string, delta: number): void {
  const list = [...selected.value]
  const from = list.indexOf(id)
  const to = from + delta
  if (from < 0 || to < 0 || to >= list.length) return
  const current = list[from] as string
  list[from] = list[to] as string
  list[to] = current
  selected.value = list
  activePreset.value = "custom"
  persist()
}

function onDrop(id: string): void {
  const from = dragId.value ? selected.value.indexOf(dragId.value) : -1
  const to = selected.value.indexOf(id)
  dragId.value = null
  if (from < 0 || to < 0 || from === to) return
  const list = [...selected.value]
  const [moved] = list.splice(from, 1)
  list.splice(to, 0, moved as string)
  selected.value = list
  activePreset.value = "custom"
  persist()
}

// 恢复默认即清除本机记忆：下次进入按最新推荐集与推荐顺序
function reset(): void {
  selected.value = [...(presets.recommended ?? [])]
  activePreset.value = "recommended"
  copied.value = false
  clearStored()
}

function fallbackCopy(text: string): boolean {
  const area = document.createElement("textarea")
  area.value = text
  area.setAttribute("readonly", "")
  area.style.position = "fixed"
  area.style.opacity = "0"
  document.body.appendChild(area)
  area.select()
  const ok = document.execCommand("copy")
  document.body.removeChild(area)
  return ok
}

async function copy(): Promise<void> {
  if (!composed.value) return
  copyError.value = false
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(composed.value)
    else if (!fallbackCopy(composed.value)) throw new Error("copy failed")
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch {
    try {
      if (!fallbackCopy(composed.value)) throw new Error("copy failed")
      copied.value = true
    } catch {
      copied.value = false
      copyError.value = true
      setTimeout(() => {
        copyError.value = false
      }, 2000)
    }
  }
}
</script>

<template>
  <div class="rule-composer">
    <div class="rc-presets">
      <button
        v-for="name in presetNames"
        :key="name"
        :class="{ active: activePreset === name }"
        @click="applyPreset(name)"
      >
        {{ presetLabels[name] ?? name }}
      </button>
    </div>
    <p class="rc-hint">默认选中「推荐」；预设只补选与重排，不会丢弃你额外勾选的模块。清空全部模块后刷新会回落推荐集。</p>
    <p v-if="envHint" class="rc-warning">
      环境与版本是工作流章节的补充，建议与工作流一起使用；单独复制时正文以
      <code>- **环境与版本**</code> 开头，不带二级标题。
    </p>

    <div class="rc-grid">
      <section class="rc-modules">
        <h3>模块</h3>
        <label v-for="mod in modules" :key="mod.id" class="rc-module">
          <input
            type="checkbox"
            :checked="selected.includes(mod.id)"
            @change="toggle(mod.id, ($event.target as HTMLInputElement).checked)"
          />
          <span class="rc-module-body">
            <strong>{{ mod.title }}</strong>
            <span class="rc-meta">{{ mod.anchor }} · {{ mod.presets.join(" / ") || "无预设" }}</span>
            <span class="rc-summary">{{ mod.summary }}</span>
          </span>
        </label>
      </section>

      <section class="rc-order">
        <h3>组合顺序</h3>
        <p v-if="selectedModules.length === 0" class="rc-empty">至少选择一个模块才能复制。</p>
        <ol>
          <li
            v-for="(mod, index) in selectedModules"
            :key="mod.id"
            draggable="true"
            @dragstart="dragId = mod.id"
            @dragover.prevent
            @drop="onDrop(mod.id)"
          >
            <span class="rc-drag">⋮⋮</span>
            <span>{{ mod.title }}</span>
            <span class="rc-actions">
              <button :disabled="index === 0" aria-label="上移" @click="move(mod.id, -1)">↑</button>
              <button :disabled="index === selectedModules.length - 1" aria-label="下移" @click="move(mod.id, 1)">↓</button>
            </span>
          </li>
        </ol>
        <p class="rc-meta">组合更新时间：{{ latest || "—" }} · 约 {{ charCount }} 字</p>
      </section>
    </div>

    <div class="rc-toolbar">
      <button class="rc-primary" :disabled="!composed" @click="copy">{{ copyError ? "复制失败" : copied ? "已复制" : "一键复制" }}</button>
      <button @click="reset">恢复默认（清除本机记忆）</button>
      <span class="rc-meta">{{ storageAvailable ? "选择只保存在当前浏览器" : "当前浏览器不可用本地存储，本次选择不保留" }}</span>
    </div>

    <details class="rc-preview">
      <summary>预览组合结果</summary>
      <pre>{{ composed || "（至少选择一个模块）" }}</pre>
    </details>

    <p class="rc-cli">等价命令：<code>{{ cliCommand }}</code></p>
  </div>
</template>

<style scoped>
.rule-composer {
  margin: 16px 0 24px;
}
.rc-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}
.rc-presets button,
.rc-toolbar button,
.rc-actions button {
  padding: 4px 10px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  cursor: pointer;
}
.rc-presets button.active,
.rc-toolbar .rc-primary {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-1);
  color: #fff;
}
.rc-toolbar button:disabled,
.rc-actions button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.rc-hint,
.rc-meta,
.rc-summary,
.rc-empty {
  font-size: 13px;
}
.rc-warning {
  font-size: 13px;
  color: var(--vp-c-warning-1);
}
.rc-meta,
.rc-summary {
  color: var(--vp-c-text-2);
}
.rc-empty {
  color: var(--vp-c-warning-1);
}
.rc-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
@media (max-width: 720px) {
  .rc-grid {
    grid-template-columns: 1fr;
  }
}
.rc-modules h3,
.rc-order h3 {
  margin: 8px 0;
  font-size: 15px;
}
.rc-module {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 8px;
  margin-bottom: 8px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
}
.rc-module-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.rc-order ol {
  margin: 8px 0;
  padding: 0;
  list-style: none;
}
.rc-order li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  margin-bottom: 6px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg-soft);
}
.rc-drag {
  color: var(--vp-c-text-3);
  cursor: grab;
}
.rc-actions {
  display: flex;
  gap: 4px;
  margin-left: auto;
}
.rc-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin: 12px 0;
}
.rc-preview pre {
  max-height: 360px;
  overflow: auto;
  padding: 12px;
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
  font-size: 13px;
}
.rc-cli code {
  word-break: break-all;
}
</style>
