<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useGlobal } from "@pureadmin/utils";
import { useNav } from "@/layout/hooks/useNav";

import ArrowLeft from "~icons/ri/arrow-left-double-fill";

interface Props {
  isActive?: boolean;
}

withDefaults(defineProps<Props>(), {
  isActive: false
});

const { t } = useI18n();
const { tooltipEffect } = useNav();

const iconClass = computed(() => {
  return ["w-[16px]", "h-[16px]"];
});

const { $storage } = useGlobal<GlobalPropertiesApi>();
const themeColor = computed(() => $storage.layout?.themeColor);

const emit = defineEmits<{
  (e: "toggleClick"): void;
}>();

const toggleClick = () => {
  emit("toggleClick");
};
</script>

<template>
  <div
    v-tippy="{
      content: isActive
        ? t('buttons.pureClickCollapse')
        : t('buttons.pureClickExpand'),
      theme: tooltipEffect,
      hideOnClick: 'toggle',
      placement: 'right'
    }"
    class="center-collapse"
    @click="toggleClick"
  >
    <IconifyIconOffline
      :icon="ArrowLeft"
      :class="[iconClass, themeColor === 'light' ? '' : 'text-primary']"
      :style="{ transform: isActive ? 'none' : 'rotateY(180deg)' }"
    />
  </div>
</template>

<style lang="scss" scoped>
.center-collapse {
  position: absolute;
  top: 50%;
  right: 2px;
  z-index: 1002;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 34px;
  cursor: pointer;
  background: rgb(255 255 255 / 85%);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-radius: var(--shell-radius-sm);
  box-shadow: var(--shell-shadow-ambient);
  transform: translate(12px, -50%);
  transition:
    background 0.2s ease,
    box-shadow 0.2s ease;

  &:hover {
    background: rgb(255 255 255 / 95%);
    box-shadow: var(--shell-accent-glow);
  }
}
</style>
