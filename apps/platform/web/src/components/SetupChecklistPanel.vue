<!--
  可点击的上手 Checklist 面板（运营向，非 BI 统计）。
-->
<template>
  <section class="setup-checklist" :aria-label="title">
    <header class="setup-checklist__head">
      <div>
        <h2 class="setup-checklist__title">{{ title }}</h2>
        <p v-if="description" class="setup-checklist__desc">{{ description }}</p>
      </div>
      <el-button v-if="dismissible" link type="info" size="small" @click="emit('dismiss')">
        不再提示
      </el-button>
    </header>
    <ol class="setup-checklist__list">
      <li
        v-for="(item, index) in displayItems"
        :key="item.id"
        class="setup-checklist__item"
        :class="{ 'setup-checklist__item--done': item.done }"
      >
        <span class="setup-checklist__index">{{ index + 1 }}</span>
        <span class="setup-checklist__label">{{ item.label }}</span>
        <el-tag v-if="item.done" size="small" type="success">已完成</el-tag>
        <el-button
          v-else-if="item.onAction"
          size="small"
          type="primary"
          link
          @click="item.onAction"
        >
          {{ item.actionLabel ?? "去完成" }}
        </el-button>
      </li>
    </ol>
  </section>
</template>

<script setup lang="ts">
import { computed, toValue, type MaybeRefOrGetter } from "vue";
import type { SetupChecklistItem } from "@/types/setup-checklist";

const props = defineProps<{
  title: string;
  description?: string;
  /** 支持数组或 Ref，避免父组件嵌套在普通对象里时未解包 */
  items: MaybeRefOrGetter<SetupChecklistItem[]>;
  dismissible?: boolean;
}>();

const displayItems = computed(() => {
  const raw = toValue(props.items);
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is SetupChecklistItem => Boolean(item?.id));
});

const emit = defineEmits<{
  dismiss: [];
}>();
</script>

<style scoped>
.setup-checklist {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  padding: 16px 18px;
  background: var(--el-fill-color-blank);
}

.setup-checklist__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.setup-checklist__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.setup-checklist__desc {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}

.setup-checklist__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.setup-checklist__item {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
}

.setup-checklist__item--done .setup-checklist__label {
  color: var(--el-text-color-secondary);
}

.setup-checklist__index {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  flex-shrink: 0;
}

.setup-checklist__item--done .setup-checklist__index {
  background: var(--el-color-success-light-9);
  color: var(--el-color-success);
}

.setup-checklist__label {
  flex: 1;
}
</style>
