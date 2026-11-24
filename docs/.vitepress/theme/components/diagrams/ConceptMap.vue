<script setup lang="ts">
// 三层结构图：上层为仓库资产，中层为随包分发的能力，下层为一次性接入动作，节点均可点
import { PIPELINE_LAYERS } from "./links"
import DiagramFrame from "./DiagramFrame.vue"
import DiagramNode from "./DiagramNode.vue"
</script>

<template>
  <div class="fx-diagram fx-map">
    <template v-for="(layer, index) in PIPELINE_LAYERS" :key="layer.title">
      <DiagramFrame
        :badge="String(index + 1).padStart(2, '0')"
        :title="layer.title"
        :caption="layer.caption"
      >
        <div class="fx-nodes">
          <DiagramNode
            v-for="node in layer.nodes"
            :key="node.id"
            :to="node.to"
            :label="node.label"
            :note="node.note"
          />
        </div>
      </DiagramFrame>
      <div v-if="index < PIPELINE_LAYERS.length - 1" class="fx-flow" aria-hidden="true">↓</div>
    </template>
  </div>
</template>

<style scoped>
.fx-map {
  display: grid;
  gap: 0;
}

/* 列数随可用宽度自适应：窄屏层框内边距收窄，节点仍能并排两列 */
.fx-nodes {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(148px, 1fr));
  gap: 8px;
}

@media (max-width: 768px) {
  .fx-nodes {
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
  }
}

.fx-flow {
  justify-self: center;
  padding: 4px 0;
  color: var(--fx-text-3);
  font-size: 12px;
  line-height: 1;
}
</style>
