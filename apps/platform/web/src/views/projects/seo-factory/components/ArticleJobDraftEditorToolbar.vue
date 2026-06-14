<!--
  所见即所得工具栏（contenteditable + execCommand）。
 -->
<template>
  <div class="draft-editor-toolbar flex flex-wrap items-center gap-1 border border-b-0 border-gray-200 bg-gray-50 px-2 py-1.5">
    <el-button
      v-for="item in HTML_EDITOR_TOOLBAR_ITEMS"
      :key="item.action"
      size="small"
      :disabled="disabled"
      :loading="item.action === 'image' && imageUploading"
      @click="emit('action', item.action)"
    >
      <span :class="item.action === 'bold' ? 'font-bold' : item.action === 'italic' ? 'italic' : ''">
        {{ item.label }}
      </span>
    </el-button>

    <template v-if="imageSelected">
      <span class="mx-1 h-4 w-px bg-gray-300" aria-hidden="true" />
      <span v-if="imageWidthPercent != null" class="px-1 text-xs text-gray-500">
        {{ imageWidthPercent }}%
      </span>
      <el-button
        v-for="item in HTML_EDITOR_IMAGE_SELECTED_ITEMS"
        :key="item.action"
        size="small"
        type="warning"
        plain
        :disabled="disabled"
        @click="emit('action', item.action)"
      >
        {{ item.label }}
      </el-button>
    </template>
  </div>
</template>

<script setup lang="ts">
import {
  HTML_EDITOR_IMAGE_SELECTED_ITEMS,
  HTML_EDITOR_TOOLBAR_ITEMS,
  type HtmlEditorAction
} from "@/utils/seo-factory/html-editor";

defineOptions({ name: "ArticleJobDraftEditorToolbar" });

defineProps<{
  disabled?: boolean;
  imageUploading?: boolean;
  imageSelected?: boolean;
  imageWidthPercent?: number | null;
}>();

const emit = defineEmits<{
  action: [action: HtmlEditorAction];
}>();
</script>

<style scoped>
.draft-editor-toolbar :deep(.el-button + .el-button) {
  margin-left: 0;
}
</style>
