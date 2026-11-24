<script setup lang="ts">
// 图示节点：统一「可选序号 + 标题 + 说明」的卡片结构，样式全部来自站点基座
import { withBase } from "vitepress"

defineProps<{
  to: string
  label: string
  note: string
  badge?: string
}>()
</script>

<template>
  <a class="fx-node" :href="withBase(to)" :title="`点击查看：${note}`">
    <span class="fx-node-head">
      <span v-if="badge" class="fx-badge">{{ badge }}</span>
      <span class="fx-node-label">{{ label }}</span>
    </span>
    <span class="fx-node-note">{{ note }}</span>
  </a>
</template>
