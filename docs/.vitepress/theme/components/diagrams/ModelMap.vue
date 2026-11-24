<script setup lang="ts">
// 五件套关系图：任务写下什么 → 规范载体提炼什么 → 技能与规则让 AI 照做 → 配置与作用域决定在哪生效
import { withBase } from "vitepress"
import { MODEL_LINKS } from "./links"
</script>

<template>
  <div class="fx-model">
    <template v-for="(node, index) in MODEL_LINKS" :key="node.id">
      <a class="fx-card" :href="withBase(node.to)" :title="`点击查看：${node.label}`">
        <span class="fx-card-label">{{ node.label }}</span>
        <span class="fx-card-note">{{ node.note }}</span>
      </a>
      <span v-if="index < MODEL_LINKS.length - 1" class="fx-arrow" aria-hidden="true">→</span>
    </template>
  </div>
</template>

<style scoped>
.fx-model {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  gap: 6px;
  margin: 16px 0;
}

.fx-card {
  flex: 1 1 140px;
  display: inline-flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: var(--vp-c-bg-soft);
  text-decoration: none;
  transition:
    border-color 0.18s ease-out,
    transform 0.18s ease-out;
}

.fx-card:hover {
  border-color: var(--vp-c-brand-1);
  transform: translateY(-1px);
}

.fx-card:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.fx-card-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.fx-card-note {
  font-size: 11px;
  color: var(--vp-c-text-3);
}

.fx-arrow {
  align-self: center;
  color: var(--vp-c-text-3);
}

@media (prefers-reduced-motion: reduce) {
  .fx-card,
  .fx-card:hover {
    transition: none;
    transform: none;
  }
}
</style>
