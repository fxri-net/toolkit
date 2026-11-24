<script setup lang="ts">
// 任务旅程图：编号徽标 + 自适应网格，列数随可用宽度增减，窄屏两列
import { JOURNEY_LINKS } from "./links"
import DiagramNode from "./DiagramNode.vue"
</script>

<template>
  <ol class="fx-diagram fx-steps">
    <li v-for="(step, index) in JOURNEY_LINKS" :key="step.id" class="fx-step">
      <DiagramNode
        :to="step.to"
        :label="step.label"
        :note="step.note"
        :badge="String(index + 1).padStart(2, '0')"
      />
    </li>
  </ol>
</template>

<style scoped>
/* 顺序由序号承载，折行不会错位 */
.fx-steps {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(148px, 1fr));
  gap: 8px;
  padding: 0;
  list-style: none;
}

.fx-step,
.fx-step > .fx-node {
  height: 100%;
}

/* 中和 VitePress 给相邻 li 的默认外边距，否则网格里首行会错位 8px */
.fx-step + .fx-step {
  margin-top: 0;
}
</style>
