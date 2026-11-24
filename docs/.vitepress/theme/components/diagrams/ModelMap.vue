<script setup lang="ts">
// 五件套关系图：任务写下什么 → 规范载体提炼什么 → 技能与规则让 AI 照做 → 配置与作用域决定在哪生效
import { MODEL_LINKS } from "./links"
import DiagramNode from "./DiagramNode.vue"
</script>

<template>
  <div class="fx-diagram fx-model">
    <DiagramNode
      v-for="(node, index) in MODEL_LINKS"
      :key="node.id"
      :to="node.to"
      :label="node.label"
      :note="node.note"
      :badge="String(index + 1).padStart(2, '0')"
    />
  </div>
</template>

<style scoped>
/* 四件套固定列数：宽屏一行等分，窄屏两列，避免按最小宽度折行后末张被拉满 */
.fx-model {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

@media (max-width: 768px) {
  .fx-model {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
