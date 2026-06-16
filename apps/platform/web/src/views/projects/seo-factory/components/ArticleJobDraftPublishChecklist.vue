<!--
  稿件发布清单：编辑后待处理项 / 发布前检查。

  边界：
  - 不负责：API 调用（由父组件处理）
 -->
<template>
  <el-card
    v-if="items.length"
    shadow="never"
    class="mb-4"
    :class="variant === 'pre-publish' ? 'border-green-200 bg-green-50/40' : 'border-amber-200 bg-amber-50/40'"
  >
    <template #header>
      <span
        class="text-sm font-medium"
        :class="variant === 'pre-publish' ? 'text-green-900' : 'text-amber-900'"
      >
        {{ headerTitle }}（{{ pendingCount }} / {{ items.length }}）
      </span>
    </template>

    <ul class="space-y-3">
      <li
        v-for="item in items"
        :key="item.id"
        class="flex flex-wrap items-start justify-between gap-2 text-sm"
      >
        <div class="flex min-w-0 items-start gap-2">
          <span
            class="mt-0.5 shrink-0 text-base leading-none"
            :class="item.done ? 'text-green-600' : variant === 'pre-publish' ? 'text-gray-500' : 'text-amber-600'"
            aria-hidden="true"
          >
            {{ item.done ? "✓" : "○" }}
          </span>
          <div>
            <div :class="item.done ? 'text-gray-500 line-through' : 'text-gray-800'">
              {{ item.label }}
            </div>
            <div v-if="item.hint" class="text-xs text-gray-500">{{ item.hint }}</div>
          </div>
        </div>
        <el-button
          v-if="item.action && !item.done && isActionButton(item.action)"
          size="small"
          :type="item.action === 'publish_cms' ? 'primary' : 'primary'"
          :plain="item.action !== 'publish_cms'"
          :loading="item.loading"
          :disabled="item.disabled"
          @click="emitAction(item.action)"
        >
          {{ actionLabel(item.action) }}
        </el-button>
        <el-button
          v-else-if="item.action === 'go_ymyl' && !item.done"
          size="small"
          type="warning"
          plain
          @click="emit('go-ymyl')"
        >
          去审查
        </el-button>
        <el-button
          v-else-if="item.action === 'go_edit' && !item.done"
          size="small"
          plain
          @click="emit('go-edit')"
        >
          去编辑
        </el-button>
      </li>
    </ul>
  </el-card>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { PublishChecklistAction, PublishChecklistItem } from "@/utils/seo-factory/draft-edit-preview";

defineOptions({ name: "ArticleJobDraftPublishChecklist" });

const props = withDefaults(
  defineProps<{
    items: PublishChecklistItem[];
    variant?: "stale" | "pre-publish";
  }>(),
  { variant: "stale" }
);

const emit = defineEmits<{
  action: [action: Exclude<PublishChecklistAction, "go_ymyl" | "go_edit" | "go_internal_links" | "go_images" | "go_sites">];
  "go-ymyl": [];
  "go-edit": [];
  "go-tab": [tab: "internalLinks" | "images"];
  "go-sites": [];
}>();

const pendingCount = computed(() => props.items.filter((item) => !item.done).length);

const headerTitle = computed(() =>
  props.variant === "pre-publish" ? "发布前检查" : "编辑后还需完成"
);

function isActionButton(action: PublishChecklistAction): boolean {
  return !["go_ymyl", "go_edit", "go_internal_links", "go_images", "go_sites"].includes(action);
}

function emitAction(action: PublishChecklistAction) {
  if (action === "go_internal_links") {
    emit("go-tab", "internalLinks");
    return;
  }
  if (action === "go_images") {
    emit("go-tab", "images");
    return;
  }
  if (action === "go_sites") {
    emit("go-sites");
    return;
  }
  emit("action", action);
}

function actionLabel(action: PublishChecklistAction) {
  if (action === "refresh_local") return "重算";
  if (action === "rerun_semrush") return "开始";
  if (action === "regenerate_export") return "生成";
  if (action === "publish_cms") return "推送";
  return "处理";
}
</script>
