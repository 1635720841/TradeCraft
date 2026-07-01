<!--
  关键词池：批量导入对话框。
-->
<template>
  <el-dialog
    :model-value="visible"
    title="批量导入关键词"
    width="560px"
    destroy-on-close
    @update:model-value="emit('update:visible', $event)"
  >
    <el-alert
      class="mb-4"
      type="info"
      :closable="false"
      show-icon
      title="格式"
      description="每行一个关键词；可选第二列：专题名称（逗号分隔）。"
    />
    <el-input
      :model-value="text"
      type="textarea"
      :rows="10"
      placeholder="industrial valve supplier&#10;stainless steel ball valve,工业阀门选型"
      @update:model-value="emit('update:text', $event)"
    />
    <template #footer>
      <el-button @click="emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="importing" @click="emit('import')">导入</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
defineOptions({ name: "KeywordImportDialog" });

defineProps<{
  visible: boolean;
  text: string;
  importing: boolean;
}>();

const emit = defineEmits<{
  "update:visible": [value: boolean];
  "update:text": [value: string];
  import: [];
}>();
</script>
