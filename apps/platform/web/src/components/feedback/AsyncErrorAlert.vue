<!--
  异步加载失败提示：统一 error alert + 重试按钮。
-->
<template>
  <el-alert
    v-if="message"
    type="error"
    :title="title"
    :description="description ?? message"
    :closable="false"
    show-icon
    class="mb-4"
  >
    <template #default>
      <div class="mt-2 flex flex-wrap gap-2">
        <el-button type="primary" size="small" link @click="emit('retry')">
          重试
        </el-button>
        <slot name="actions" />
      </div>
    </template>
  </el-alert>
</template>

<script setup lang="ts">
defineProps<{
  message: string | null;
  title?: string;
  description?: string;
}>();

const emit = defineEmits<{
  retry: [];
}>();
</script>
