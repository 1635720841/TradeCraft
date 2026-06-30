<!--
  租户加购配额对话框（Console 租户管理共用）。
-->
<template>
  <el-dialog
    :model-value="visible"
    title="加购配额"
    width="400px"
    destroy-on-close
    @update:model-value="emit('update:visible', $event)"
  >
    <el-form label-width="80px">
      <el-form-item v-if="tenantName" label="租户">
        <span>{{ tenantName }}</span>
      </el-form-item>
      <el-form-item label="加购数量">
        <el-input-number v-model="amount" :min="1" :max="100000" class="w-full" />
      </el-form-item>
      <el-form-item label="备注">
        <el-input v-model="note" maxlength="200" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="submit">确认</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { ElMessageBox } from "element-plus";
import { addTenantQuotaTopUp } from "@/api/console/index";
import { message } from "@/utils/message";

defineOptions({ name: "TenantTopUpDialog" });

const props = defineProps<{
  visible: boolean;
  organizationId: string;
  tenantName?: string;
}>();

const emit = defineEmits<{
  "update:visible": [value: boolean];
  success: [];
}>();

const saving = ref(false);
const amount = ref(100);
const note = ref("");

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      amount.value = 100;
      note.value = "";
    }
  }
);

async function submit() {
  if (!props.organizationId) return;
  try {
    await ElMessageBox.confirm(
      `确认为该租户加购 ${amount.value} 篇文章配额？`,
      "加购配额",
      { type: "warning", confirmButtonText: "确认", cancelButtonText: "取消" }
    );
  } catch {
    return;
  }
  saving.value = true;
  try {
    await addTenantQuotaTopUp(
      props.organizationId,
      amount.value,
      note.value.trim() || undefined
    );
    message("配额加购成功", { type: "success" });
    emit("update:visible", false);
    emit("success");
  } finally {
    saving.value = false;
  }
}
</script>
