<script setup lang="ts">
// 三层结构图：上层为仓库资产，中层为随包分发的能力，下层为一次性接入动作，节点均可点
import { withBase } from "vitepress"
import { PIPELINE_LAYERS } from "./links"
</script>

<template>
  <div class="tk-map">
    <section v-for="layer in PIPELINE_LAYERS" :key="layer.title" class="tk-layer">
      <p class="tk-layer-title">{{ layer.title }}</p>
      <p class="tk-layer-caption">{{ layer.caption }}</p>
      <div class="tk-nodes">
        <a
          v-for="node in layer.nodes"
          :key="node.id"
          class="tk-node"
          :href="withBase(node.to)"
          :title="`点击查看：${node.label}`"
        >
          <span class="tk-node-label">{{ node.label }}</span>
          <span class="tk-node-note">{{ node.note }}</span>
        </a>
      </div>
    </section>
  </div>
</template>

<style scoped>
.tk-map {
  display: grid;
  gap: 10px;
  margin: 16px 0;
}

.tk-layer {
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  padding: 12px 14px;
  background: var(--vp-c-bg-soft);
}

.tk-layer-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.tk-layer-caption {
  margin: 2px 0 10px;
  font-size: 12px;
  color: var(--vp-c-text-3);
}

.tk-nodes {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tk-node {
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

.tk-node:hover {
  border-color: var(--vp-c-brand-1);
  transform: translateY(-1px);
}

.tk-node:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.tk-node-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.tk-node-note {
  font-size: 11px;
  color: var(--vp-c-text-3);
}

@media (prefers-reduced-motion: reduce) {
  .tk-node,
  .tk-node:hover {
    transition: none;
    transform: none;
  }
}
</style>
