<!--
  关键词批量加入专题：选择已有专题或新建专题。

  边界：
  - 不负责：关键词勾选与列表（KeywordPoolView / KeywordPoolTable）
-->
<template>
  <el-dialog
    :model-value="modelValue"
    title="加入专题"
    width="460px"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <el-radio-group v-model="assignMode" class="mb-4">
      <el-radio value="existing">选择已有专题</el-radio>
      <el-radio value="new">新建专题</el-radio>
    </el-radio-group>
    <el-select
      v-if="assignMode === 'existing'"
      v-model="assignClusterId"
      class="w-full"
      placeholder="选择专题"
    >
      <el-option v-for="item in clusters" :key="item.id" :label="item.name" :value="item.id" />
    </el-select>
    <el-input
      v-else
      v-model="newClusterName"
      maxlength="100"
      show-word-limit
      placeholder="如：工业阀门选型"
    />
    <p class="mt-3 text-sm text-gray-500">
      将把已选的 {{ keywordIds.length }} 个关键词归入该专题。
    </p>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="assigningCluster" @click="submitAssignCluster">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import {
  assignKeywordsToCluster,
  createKeywordCluster,
  type KeywordClusterItem
} from "@/api/seo-factory/keyword-cluster";
import { message } from "@/utils/message";

defineOptions({ name: "KeywordClusterAssignDialog" });

const props = defineProps<{
  modelValue: boolean;
  projectId: string;
  clusters: KeywordClusterItem[];
  keywordIds: string[];
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  assigned: [];
}>();

const assigningCluster = ref(false);
const assignClusterId = ref("");
const assignMode = ref<"existing" | "new">("existing");
const newClusterName = ref("");

function resetForm() {
  assignMode.value = props.clusters.length > 0 ? "existing" : "new";
  assignClusterId.value = props.clusters[0]?.id ?? "";
  newClusterName.value = "";
}

watch(
  () => props.modelValue,
  (visible) => {
    if (visible) resetForm();
  }
);

async function submitAssignCluster() {
  if (props.keywordIds.length === 0) return;

  if (assignMode.value === "new") {
    const name = newClusterName.value.trim();
    if (name.length < 2) {
      message("请输入至少 2 个字的专题名称", { type: "warning" });
      return;
    }
    assigningCluster.value = true;
    try {
      await createKeywordCluster(props.projectId, { name, keywordIds: props.keywordIds });
      message(`已创建专题并加入 ${props.keywordIds.length} 个关键词`, { type: "success" });
      emit("update:modelValue", false);
      emit("assigned");
    } finally {
      assigningCluster.value = false;
    }
    return;
  }

  if (!assignClusterId.value) {
    message("请选择专题", { type: "warning" });
    return;
  }
  assigningCluster.value = true;
  try {
    const result = await assignKeywordsToCluster(
      props.projectId,
      assignClusterId.value,
      props.keywordIds
    );
    message(`已加入专题：${result.assigned} 个关键词`, { type: "success" });
    emit("update:modelValue", false);
    emit("assigned");
  } finally {
    assigningCluster.value = false;
  }
}
</script>
