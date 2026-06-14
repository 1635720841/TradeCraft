<!--
  AI 重写抽屉：按建议优化 / 自然语言定向改写。

  边界：
  - 不负责：任务轮询（由父组件 JobDetailView 处理）
-->
<template>
  <el-drawer
    :model-value="modelValue"
    title="AI 重写"
    size="480px"
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
  >
    <el-form label-position="top">
      <el-form-item label="重写模式">
        <el-radio-group v-model="form.mode">
          <el-radio value="suggestions">按建议优化</el-radio>
          <el-radio value="instruction">定向改写</el-radio>
        </el-radio-group>
      </el-form-item>

      <el-form-item v-if="form.mode === 'suggestions'" label="优化建议">
        <template v-if="availableSuggestions.length">
          <el-checkbox-group v-model="form.selectedSuggestions">
            <div
              v-for="(item, index) in availableSuggestions"
              :key="index"
              class="mb-2"
            >
              <el-checkbox :value="item">{{ item }}</el-checkbox>
            </div>
          </el-checkbox-group>
        </template>
        <el-empty v-else description="暂无 SEO 建议，请改用「定向改写」" :image-size="64" />
      </el-form-item>

      <el-form-item v-else label="改写指令">
        <el-input
          v-model="form.instruction"
          type="textarea"
          :rows="5"
          maxlength="2000"
          show-word-limit
          placeholder="例如：语气更口语化；案例换成 2024 年；保留现有小标题结构"
        />
      </el-form-item>

      <el-form-item>
        <el-checkbox v-model="form.keepTitleMeta">保留标题与 Meta Description</el-checkbox>
      </el-form-item>

      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="改写后自动刷新本地 SEO 分"
        description="采纳新版本时会重算本地预检（单句 ≤22 词、单段 ≤80 词）。若仅改语气不想动结构，可在采纳后手动查看评分。"
      />
    </el-form>

    <template #footer>
      <div class="flex justify-end gap-2">
        <el-button @click="emit('update:modelValue', false)">取消</el-button>
        <el-button type="primary" :loading="submitting" :disabled="!canSubmit" @click="handleSubmit">
          开始重写
        </el-button>
      </div>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import type { ArticleJobRewriteMode } from "@/api/seo-factory/types";

defineOptions({ name: "ArticleJobRewriteDrawer" });

const props = defineProps<{
  modelValue: boolean;
  suggestions?: string[];
  submitting?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  submit: [
    payload: {
      mode: ArticleJobRewriteMode;
      instruction?: string;
      suggestions?: string[];
      options: { keepTitleMeta: boolean };
    }
  ];
}>();

const form = reactive({
  mode: "suggestions" as ArticleJobRewriteMode,
  instruction: "",
  selectedSuggestions: [] as string[],
  keepTitleMeta: true
});

const availableSuggestions = computed(() => props.suggestions ?? []);

const canSubmit = computed(() => {
  if (props.submitting) return false;
  if (form.mode === "instruction") {
    return form.instruction.trim().length >= 2;
  }
  return form.selectedSuggestions.length > 0 || availableSuggestions.value.length > 0;
});

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    form.mode = availableSuggestions.value.length > 0 ? "suggestions" : "instruction";
    form.instruction = "";
    form.selectedSuggestions = [...availableSuggestions.value];
    form.keepTitleMeta = true;
  }
);

function handleSubmit() {
  emit("submit", {
    mode: form.mode,
    instruction: form.mode === "instruction" ? form.instruction.trim() : undefined,
    suggestions:
      form.mode === "suggestions"
        ? form.selectedSuggestions.length > 0
          ? form.selectedSuggestions
          : availableSuggestions.value
        : undefined,
    options: { keepTitleMeta: form.keepTitleMeta }
  });
}
</script>
