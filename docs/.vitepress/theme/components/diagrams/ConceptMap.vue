<script setup lang="ts">
// 三层结构图：上层为仓库资产，中层为随包分发的能力，下层为一次性接入动作，节点均可点
import { withBase } from "vitepress"
import { PIPELINE_LAYERS } from "./links"
</script>

<template>
  <div class="fx-map">
    <section v-for="layer in PIPELINE_LAYERS" :key="layer.title" class="fx-layer">
      <p class="fx-layer-title">{{ layer.title }}</p>
      <p class="fx-layer-caption">{{ layer.caption }}</p>
      <div class="fx-nodes">
        <a
          v-for="node in layer.nodes"
          :key="node.id"
          class="fx-node"
          :href="withBase(node.to)"
          :title="`点击查看：${node.label}`"
        >
          <span class="fx-node-label">{{ node.label }}</span>
          <span class="fx-node-note">{{ node.note }}</span>
        </a>
      </div>
    </section>
  </div>
</template>

<style scoped>
.fx-map {
  display: grid;
  gap: 10px;
  margin: 16px 0;
}

.fx-layer {
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  padding: 12px 14px;
  background: var(--vp-c-bg-soft);
}

.fx-layer-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.fx-layer-caption {
  margin: 2px 0 10px;
  font-size: 12px;
  color: var(--vp-c-text-3);
}

.fx-nodes {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.fx-node {
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

.fx-node:hover {
  border-color: var(--vp-c-brand-1);
  transform: translateY(-1px);
}

.fx-node:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.fx-node-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.fx-node-note {
  font-size: 11px;
  color: var(--vp-c-text-3);
}

@media (prefers-reduced-motion: reduce) {
  .fx-node,
  .fx-node:hover {
    transition: none;
    transform: none;
  }
}
</style>
