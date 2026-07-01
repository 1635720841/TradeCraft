<!--
  关键词池：添加/编辑关键词对话框。
-->
<template>
  <el-dialog
    :model-value="visible"
    :title="editingId ? '编辑关键词' : '添加关键词'"
    width="560px"
    destroy-on-close
    @update:model-value="emit('update:visible', $event)"
  >
    <el-form ref="formRef" :model="form" :rules="formRules" label-width="100px">
      <el-form-item label="关键词" prop="keyword">
        <el-input v-model="form.keyword" :disabled="Boolean(editingId)" maxlength="200" />
      </el-form-item>
      <el-form-item label="搜索意图" prop="intent">
        <el-select v-model="form.intent" class="w-full">
          <el-option
            v-for="item in keywordIntentDict"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="所属专题">
        <el-select v-model="form.clusterId" class="w-full" clearable placeholder="未分组">
          <el-option v-for="item in clusters" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="商业价值">
        <el-slider v-model="form.businessValueScore" :min="0" :max="1" :step="0.05" show-input />
      </el-form-item>
      <el-form-item label="内容匹配">
        <el-slider v-model="form.contentFitScore" :min="0" :max="1" :step="0.05" show-input />
      </el-form-item>
      <el-form-item label="备注">
        <el-input v-model="form.notes" type="textarea" :rows="3" maxlength="2000" show-word-limit />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="emit('save')">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from "vue";
import type { FormInstance, FormRules } from "element-plus";
import type { KeywordClusterItem } from "@/api/seo-factory/keyword-cluster";
import { keywordIntentDict } from "@/constants/dicts/seo-factory";

defineOptions({ name: "KeywordFormDialog" });

export interface KeywordFormModel {
  keyword: string;
  intent: string;
  businessValueScore: number;
  contentFitScore: number;
  notes: string;
  clusterId?: string;
}

defineProps<{
  visible: boolean;
  editingId: string;
  form: KeywordFormModel;
  clusters: KeywordClusterItem[];
  saving: boolean;
  formRules: FormRules;
}>();

const emit = defineEmits<{
  "update:visible": [value: boolean];
  save: [];
}>();

const formRef = ref<FormInstance>();

async function validate(): Promise<boolean> {
  if (!formRef.value) return false;
  return formRef.value.validate().catch(() => false);
}

defineExpose({ validate });
</script>
