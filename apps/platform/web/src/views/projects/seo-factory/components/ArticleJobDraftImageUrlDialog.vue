<!--
  外链图片插入（替代 window.prompt）。
 -->
<template>
  <el-dialog
    :model-value="modelValue"
    title="插入外链图片"
    width="480px"
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
    @closed="resetForm"
  >
    <el-form label-position="top">
      <el-form-item label="图片 URL" required>
        <el-input v-model="form.url" placeholder="https://..." />
      </el-form-item>
      <el-form-item label="Alt 描述（SEO）">
        <el-input v-model="form.alt" placeholder="可选，建议填写" />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :disabled="!form.url.trim()" @click="handleConfirm">
        插入
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { reactive, watch } from "vue";

defineOptions({ name: "ArticleJobDraftImageUrlDialog" });

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  confirm: [payload: { url: string; alt: string }];
}>();

const form = reactive({ url: "", alt: "" });

watch(
  () => props.modelValue,
  (open) => {
    if (open) resetForm();
  }
);

function resetForm() {
  form.url = "";
  form.alt = "";
}

function handleConfirm() {
  const url = form.url.trim();
  if (!url) return;
  emit("confirm", { url, alt: form.alt.trim() });
  emit("update:modelValue", false);
}
</script>
