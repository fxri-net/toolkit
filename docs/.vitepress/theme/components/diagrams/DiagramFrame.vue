<script setup lang="ts">
// 图示层框：统一「层号 + 层名 + 层说明」的容器，层内节点由插槽给出
defineProps<{
  title: string
  caption: string
  badge?: string
}>()
</script>

<template>
  <section class="fx-frame">
    <div class="fx-frame-head">
      <span v-if="badge" class="fx-badge">{{ badge }}</span>
      <p class="fx-frame-title">{{ title }}</p>
      <p class="fx-frame-caption">{{ caption }}</p>
    </div>
    <div class="fx-frame-body">
      <slot />
    </div>
  </section>
</template>
