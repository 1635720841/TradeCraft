<!--
  编辑后发布清单：引导用户完成重算 SEO / 审核 / 导出。

  边界：
  - 不负责：API 调用（由父组件处理）
 -->
<template>
  <el-card v-if="items.length" shadow="never" class="mb-4 border-amber-200 bg-amber-50/40">
    <template #header>
      <span class="text-sm font-medium text-amber-900">
        编辑后还需完成（{{ pendingCount }} / {{ items.length }}）
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
            :class="item.done ? 'text-green-600' : 'text-amber-600'"
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
          v-if="item.action && !item.done && item.action !== 'go_ymyl' && item.action !== 'go_edit'"
          size="small"
          type="primary"
          plain
          :loading="item.loading"
          :disabled="item.disabled"
          @click="emit('action', item.action!)"
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
      </li>
    </ul>
  </el-card>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { PublishChecklistAction, PublishChecklistItem } from "@/utils/seo-factory/draft-edit-preview";

defineOptions({ name: "ArticleJobDraftPublishChecklist" });

const props = defineProps<{
  items: PublishChecklistItem[];
}>();

const emit = defineEmits<{
  action: [action: Exclude<PublishChecklistAction, "go_ymyl" | "go_edit">];
  "go-ymyl": [];
}>();

const pendingCount = computed(() => props.items.filter((item) => !item.done).length);

function actionLabel(action: PublishChecklistAction) {
  if (action === "refresh_local") return "重算";
  if (action === "rerun_semrush") return "开始";
  if (action === "regenerate_export") return "生成";
  return "处理";
}
</script>
