<!--
  管理端页面壳：Org / Console 统一标题区 + 默认卡片容器。
-->
<template>
  <div class="admin-page p-4 space-y-4">
    <div v-if="title || $slots.actions" class="admin-page__header flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 v-if="title" class="admin-page__title text-lg font-medium m-0">{{ title }}</h1>
        <p v-if="description" class="admin-page__desc text-sm text-gray-500 mt-1 mb-0">{{ description }}</p>
      </div>
      <div v-if="$slots.actions" class="admin-page__actions flex flex-wrap gap-2">
        <slot name="actions" />
      </div>
    </div>
    <el-alert v-if="$slots.alert" :closable="false" show-icon type="info" class="admin-page__alert">
      <slot name="alert" />
    </el-alert>
    <el-card shadow="never" :body-class="bodyClass">
      <slot />
    </el-card>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: "AdminPageShell" });

withDefaults(
  defineProps<{
    title?: string;
    description?: string;
    bodyClass?: string;
  }>(),
  { bodyClass: "" }
);
</script>

<style scoped>
.admin-page__title {
  color: var(--mw-ink, #132344);
}
</style>
