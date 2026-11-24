<script setup lang="ts">
// 任务旅程图：一条任务从说需求到规范沉淀的七个步骤，每步可点到对应页面
import { withBase } from "vitepress"
import { JOURNEY_LINKS } from "./links"
</script>

<template>
  <div class="fx-journey">
    <template v-for="(step, index) in JOURNEY_LINKS" :key="step.id">
      <a class="fx-step" :href="withBase(step.to)" :title="`点击查看：${step.note}`">
        <span class="fx-step-label">{{ step.label }}</span>
        <span class="fx-step-note">{{ step.note }}</span>
      </a>
      <span v-if="index < JOURNEY_LINKS.length - 1" class="fx-arrow" aria-hidden="true">→</span>
    </template>
  </div>
</template>

<style scoped>
.fx-journey {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  gap: 6px;
  margin: 16px 0;
  padding: 14px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: var(--vp-c-bg-soft);
}

.fx-step {
  display: inline-flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 10px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
  text-decoration: none;
  transition:
    border-color 0.18s ease-out,
    transform 0.18s ease-out;
}

.fx-step:hover {
  border-color: var(--vp-c-brand-1);
  transform: translateY(-1px);
}

.fx-step:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.fx-step-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.fx-step-note {
  font-size: 11px;
  color: var(--vp-c-text-3);
}

.fx-arrow {
  align-self: center;
  color: var(--vp-c-text-3);
}

@media (prefers-reduced-motion: reduce) {
  .fx-step,
  .fx-step:hover {
    transition: none;
    transform: none;
  }
}
</style>
