<!--
  回滚确认：展示变更摘要后再执行。

  边界：
  - 不负责：rollback API（父组件处理）
 -->
<template>
  <el-dialog
    :model-value="modelValue"
    title="确认回滚"
    width="440px"
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template v-if="entry">
      <p class="text-sm text-gray-700">
        将恢复至 <strong>{{ formatTime(entry.editedAt) }}</strong> 编辑前的版本。
      </p>
      <p class="mt-2 text-sm text-amber-600">
        当前正文若有未保存修改将丢失；回滚后 SEO 分与导出物可能再次失效。
      </p>
      <el-descriptions class="mt-4" :column="1" border size="small">
        <el-descriptions-item label="变更摘要">
          {{ changeSummary }}
        </el-descriptions-item>
        <el-descriptions-item v-if="entry.snapshot.title" label="回滚后标题">
          {{ entry.snapshot.title }}
        </el-descriptions-item>
        <el-descriptions-item label="回滚后正文字数">
          {{ entry.snapshot.content.length }} 字
        </el-descriptions-item>
      </el-descriptions>
    </template>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="warning" :loading="submitting" @click="handleConfirm">
        确认回滚
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ManualEditHistoryEntry } from "@/api/seo-factory/types";
import { formatHistoryChangeSummary } from "@/utils/seo-factory/draft-edit-preview";

defineOptions({ name: "ArticleJobDraftRollbackDialog" });

const props = defineProps<{
  modelValue: boolean;
  entry?: ManualEditHistoryEntry | null;
  submitting?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  confirm: [];
}>();

const changeSummary = computed(() =>
  props.entry ? formatHistoryChangeSummary(props.entry) : ""
);

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function handleConfirm() {
  emit("confirm");
}
</script>
