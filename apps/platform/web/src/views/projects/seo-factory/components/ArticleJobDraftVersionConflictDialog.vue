<!--
  版本冲突：刷新后重试保存，保留编辑器内未保存内容。
 -->
<template>
  <el-dialog
    :model-value="modelValue"
    title="稿件已被更新"
    width="460px"
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
  >
    <p class="text-sm text-gray-700">
      服务器上的稿件版本已更新（可能由他人编辑或页面自动刷新引起）。请刷新任务数据后重试保存。
    </p>
    <p class="mt-2 text-sm text-amber-600">你在编辑器中的修改会保留，不会丢失。</p>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="emit('retry')">
        刷新并重试保存
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
defineOptions({ name: "ArticleJobDraftVersionConflictDialog" });

defineProps<{
  modelValue: boolean;
  submitting?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  retry: [];
}>();
</script>
