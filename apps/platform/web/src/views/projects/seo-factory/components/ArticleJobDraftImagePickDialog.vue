<!--
  从任务配图或项目媒体库插入正文。
-->
<template>
  <el-dialog
    :model-value="modelValue"
    title="插入图片"
    width="620px"
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
    @open="handleOpen"
  >
    <el-tabs v-model="activeTab">
      <el-tab-pane label="任务配图" name="job">
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
            <el-button size="small" type="primary" @click="emitPick(image)">插入</el-button>
          </li>
        </ul>
      </el-tab-pane>

      <el-tab-pane label="媒体库" name="library">
        <div v-loading="libraryLoading" class="min-h-[120px]">
          <el-empty v-if="!libraryLoading && !libraryItems.length" description="媒体库暂无图片" />
          <ul v-else class="space-y-3">
            <li
              v-for="asset in libraryItems"
              :key="asset.id"
              class="flex items-center gap-3 rounded border border-gray-200 p-2"
            >
              <img
                :src="asset.url"
                :alt="asset.id"
                class="h-16 w-24 shrink-0 rounded object-cover bg-gray-100"
              />
              <div class="min-w-0 flex-1 text-xs text-gray-500">
                {{ asset.contentType }} · {{ formatSize(asset.sizeBytes) }}
              </div>
              <el-button size="small" type="primary" @click="emitPickFromLibrary(asset)">
                插入
              </el-button>
            </li>
          </ul>
        </div>
      </el-tab-pane>
    </el-tabs>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from "vue";
import type { ArticleJobArticleImage } from "@/api/seo-factory/types";
import { listMediaAssets, type MediaAsset } from "@/api/platform/media";
import { message } from "@/utils/message";

defineOptions({ name: "ArticleJobDraftImagePickDialog" });

const props = defineProps<{
  modelValue: boolean;
  projectId: string;
  images: ArticleJobArticleImage[];
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  pick: [image: ArticleJobArticleImage];
}>();

const activeTab = ref<"job" | "library">("job");
const libraryLoading = ref(false);
const libraryItems = ref<MediaAsset[]>([]);

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function emitPick(image: ArticleJobArticleImage) {
  emit("pick", image);
  emit("update:modelValue", false);
}

function emitPickFromLibrary(asset: MediaAsset) {
  emit("pick", {
    alt: "",
    url: asset.url,
    assetId: asset.id,
    source: asset.source === "upload" ? "upload" : asset.source === "url" ? "url" : "bfl"
  });
  emit("update:modelValue", false);
}

async function handleOpen() {
  if (!props.projectId) return;
  libraryLoading.value = true;
  try {
    libraryItems.value = await listMediaAssets(props.projectId, { limit: 50 });
  } catch (error) {
    libraryItems.value = [];
    message(error instanceof Error ? error.message : "加载媒体库失败", { type: "error" });
  } finally {
    libraryLoading.value = false;
  }
}
</script>
