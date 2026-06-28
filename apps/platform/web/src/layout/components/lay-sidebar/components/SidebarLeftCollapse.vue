<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { useNav } from "@/layout/hooks/useNav";

interface Props {
  isActive?: boolean;
}

withDefaults(defineProps<Props>(), {
  isActive: false
});

const { t } = useI18n();
const { tooltipEffect } = useNav();

const emit = defineEmits<{
  (e: "toggleClick"): void;
}>();

const toggleClick = () => {
  emit("toggleClick");
};
</script>

<template>
  <button
    type="button"
    class="left-collapse"
    v-tippy="{
      content: isActive
        ? t('buttons.pureClickCollapse')
        : t('buttons.pureClickExpand'),
      theme: tooltipEffect,
      hideOnClick: 'toggle',
      placement: 'right'
    }"
    @click="toggleClick"
  >
    <span class="collapse-icon" aria-hidden="true">⇇</span>
    <span class="collapse-label">
      {{ isActive ? "收起菜单" : "展开菜单" }}
    </span>
  </button>
</template>

<style lang="scss" scoped>
.left-collapse {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
  height: 40px;
  padding: 10px 12px;
  margin-top: 16px;
  color: #7a8ba5;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
  transition:
    color 0.2s ease,
    background 0.2s ease;

  &:hover {
    color: var(--shell-accent);
    background: var(--shell-accent-soft);
    border-radius: var(--shell-radius-md);
  }

  .collapse-icon {
    font-size: 14px;
    line-height: 1;
  }

  .collapse-label {
    font-size: 13px;
    font-weight: 600;
    line-height: 1;
  }
}
</style>
