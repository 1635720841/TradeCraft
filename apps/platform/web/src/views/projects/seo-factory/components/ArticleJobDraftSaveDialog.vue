<!--
  保存编辑确认：智能默认 + 失效说明。

  边界：
  - 不负责：PATCH 请求（由父组件处理）
 -->
<template>
  <el-dialog
    :model-value="modelValue"
    title="保存编辑"
    width="520px"
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
  >
    <p class="mb-3 text-sm text-gray-600">{{ summaryText }}</p>

    <el-alert
      v-if="suggestReason"
      class="mb-3"
      type="info"
      :closable="false"
      show-icon
      :title="suggestReason"
    />

    <el-alert
      v-if="showYmylWarning"
      class="mb-3"
      type="warning"
      :closable="false"
      show-icon
      title="保存后将重新进入 YMYL 人工审核"
      description="此前已通过审核的任务，编辑后需再次审核通过才能导出。"
    />

    <el-alert
      v-if="staleItems.length"
      class="mb-4"
      type="warning"
      :closable="false"
      show-icon
      title="以下结果将失效"
    >
      <ul class="list-inside list-disc text-sm">
        <li v-for="item in staleItems" :key="item">{{ item }}</li>
      </ul>
    </el-alert>

    <el-form label-position="top">
      <el-form-item label="保存后操作">
        <el-radio-group v-model="postSaveAction">
          <el-radio value="refresh_local">
            {{ refreshLocalLabel }}
          </el-radio>
          <el-radio value="rerun_from_optimizing">
            {{ semrushLabel }}
          </el-radio>
          <el-radio value="none">仅保存，稍后按清单处理</el-radio>
        </el-radio-group>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="handleConfirm">确认保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { DraftPostSaveAction, DraftStalenessAffected } from "@/api/seo-factory/types";
import { suggestPostSaveAction, suggestPostSaveReason } from "@/utils/seo-factory/draft-edit-preview";

defineOptions({ name: "ArticleJobDraftSaveDialog" });

const props = defineProps<{
  modelValue: boolean;
  submitting?: boolean;
  summaryText?: string;
  affected?: DraftStalenessAffected | null;
  showYmylWarning?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  confirm: [action: DraftPostSaveAction];
}>();

const postSaveAction = ref<DraftPostSaveAction>("refresh_local");

const suggestReason = computed(() => suggestPostSaveReason(props.affected ?? null));

const refreshLocalLabel = computed(() =>
  props.affected?.semrush ? "保存并重算本地 SEO（必做）" : "保存并重算本地 SEO（推荐）"
);

const semrushLabel = computed(() =>
  props.affected?.semrush
    ? "保存并重跑 Semrush 终检（推荐，约 2–5 分钟）"
    : "保存并重跑 Semrush 终检（耗时长）"
);

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      postSaveAction.value = suggestPostSaveAction(props.affected ?? null);
    }
  }
);

watch(
  () => props.affected,
  (affected) => {
    if (props.modelValue) {
      postSaveAction.value = suggestPostSaveAction(affected ?? null);
    }
  }
);

const staleItems = computed(() => {
  const affected = props.affected;
  if (!affected) return [];
  const items: string[] = [];
  if (affected.localSeo) items.push("本地 SEO 分");
  if (affected.semrush) items.push("Semrush 分");
  if (affected.ymyl) items.push("YMYL 审查状态");
  if (affected.export) items.push("导出 HTML / 资产包");
  if (affected.internalLinks) items.push("内链锚点（建议核对）");
  if (affected.images) items.push("配图占位（建议核对）");
  return items;
});

function handleConfirm() {
  emit("confirm", postSaveAction.value);
}
</script>
