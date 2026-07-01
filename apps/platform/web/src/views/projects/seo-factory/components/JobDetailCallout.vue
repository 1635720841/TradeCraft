<!--
  任务详情页顶部提示条（下一步 / GSC / 优化进度等共用结构）。
-->
<template>
  <section
    v-if="title"
    class="job-detail-callout job-detail-callout--compact"
    :class="`job-detail-callout--${type}`"
  >
    <IconifyIconOnline :icon="icon" class="job-detail-callout__icon" />
    <div class="job-detail-callout__body">
      <strong>{{ title }}</strong>
      <span v-if="description">{{ description }}</span>
    </div>
    <div v-if="$slots.actions" class="job-detail-callout__actions">
      <slot name="actions" />
    </div>
    <el-button
      v-else-if="actionLabel"
      size="small"
      :type="buttonType"
      :loading="actionLoading"
      :disabled="actionDisabled"
      @click="emit('action')"
    >
      {{ actionLabel }}
    </el-button>
  </section>
</template>

<script setup lang="ts">
defineOptions({ name: "JobDetailCallout" });

withDefaults(
  defineProps<{
    type?: "success" | "warning" | "info" | "error";
    icon: string;
    title: string;
    description?: string;
    actionLabel?: string;
    buttonType?: "primary" | "success" | "warning" | "danger" | "info" | "default";
    actionLoading?: boolean;
    actionDisabled?: boolean;
  }>(),
  {
    type: "info",
    buttonType: "primary",
    actionLoading: false,
    actionDisabled: false
  }
);

const emit = defineEmits<{
  action: [];
}>();
</script>
