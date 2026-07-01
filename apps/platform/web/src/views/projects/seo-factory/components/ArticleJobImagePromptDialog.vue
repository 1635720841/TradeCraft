<!--
  配图生成/重生成：可编辑 prompt。
-->
<template>
  <el-dialog
    :model-value="modelValue"
    :title="mode === 'generate' ? '按描述生成配图' : '重新生成配图'"
    width="520px"
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
  >
    <el-form label-position="top">
      <el-form-item v-if="mode === 'generate'" label="插入章节">
        <el-select v-model="insertAfterHeading" clearable placeholder="正文末尾（默认）" class="w-full">
          <el-option
            v-for="heading in headingOptions"
            :key="heading"
            :label="heading"
            :value="heading"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="画面描述">
        <el-input
          v-model="prompt"
          type="textarea"
          :rows="4"
          maxlength="2000"
          show-word-limit
          placeholder="描述想要的配图场景，例如：现代化工厂车间中的 CNC 加工中心"
        />
      </el-form-item>
      <el-form-item v-if="mode === 'generate'" label="Alt 文本（SEO，可选）">
        <el-input v-model="alt" maxlength="200" placeholder="留空则自动生成" />
      </el-form-item>
      <p class="text-xs text-gray-500">
        将消耗 1 次生图额度。系统会自动优化为「无标识、无文字」的实拍风格描述；请勿在描述里要求出现文字或 Logo。
      </p>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="submitting" :disabled="!prompt.trim()" @click="handleSubmit">
        {{ mode === "generate" ? "生成并插入" : "重新生成" }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";

defineOptions({ name: "ArticleJobImagePromptDialog" });

const props = defineProps<{
  modelValue: boolean;
  mode: "generate" | "regenerate";
  initialPrompt?: string;
  headingOptions: string[];
  submitting?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  submit: [payload: { prompt: string; alt?: string; insertAfterHeading?: string }];
}>();

const prompt = ref("");
const alt = ref("");
const insertAfterHeading = ref<string | undefined>();

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    prompt.value = props.initialPrompt ?? "";
    alt.value = "";
    insertAfterHeading.value = undefined;
  }
);

function handleSubmit() {
  const trimmed = prompt.value.trim();
  if (!trimmed) return;
  emit("submit", {
    prompt: trimmed,
    alt: alt.value.trim() || undefined,
    insertAfterHeading: insertAfterHeading.value
  });
}
</script>
