<!--
  从 AI 配图列表插入正文。
 -->
<template>
  <el-dialog
    :model-value="modelValue"
    title="从 AI 配图插入"
    width="560px"
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
  >
    <el-empty v-if="!images.length" description="暂无 AI 配图，请等待工作流完成配图步骤" />

    <ul v-else class="space-y-3">
      <li
        v-for="(image, index) in images"
        :key="`${image.url}-${index}`"
        class="flex items-center gap-3 rounded border border-gray-200 p-2"
      >
        <img
          :src="image.url"
          :alt="image.alt"
          class="h-16 w-24 shrink-0 rounded object-cover bg-gray-100"
        />
        <div class="min-w-0 flex-1">
          <div class="truncate text-sm font-medium">{{ image.alt || "无 Alt" }}</div>
          <div v-if="image.insertAfterHeading" class="text-xs text-gray-500">
            章节：{{ image.insertAfterHeading }}
          </div>
        </div>
        <el-button size="small" type="primary" @click="emit('pick', image)">插入</el-button>
      </li>
    </ul>
  </el-dialog>
</template>

<script setup lang="ts">
import type { ArticleJobArticleImage } from "@/api/seo-factory/types";

defineOptions({ name: "ArticleJobDraftImagePickDialog" });

defineProps<{
  modelValue: boolean;
  images: ArticleJobArticleImage[];
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  pick: [image: ArticleJobArticleImage];
}>();
</script>
