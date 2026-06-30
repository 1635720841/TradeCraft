<!--
  租户编辑/新建对话框（Console 租户管理共用）。
-->
<template>
  <el-dialog
    :model-value="visible"
    :title="mode === 'create' ? '新建租户' : '编辑租户'"
    :width="mode === 'create' ? '520px' : '480px'"
    destroy-on-close
    @update:model-value="emit('update:visible', $event)"
  >
    <el-form
      v-if="mode === 'create'"
      ref="createFormRef"
      :model="createForm"
      :rules="createRules"
      label-width="120px"
    >
      <el-form-item label="企业名称" prop="organizationName">
        <el-input v-model="createForm.organizationName" maxlength="120" />
      </el-form-item>
      <el-form-item label="管理员邮箱" prop="adminEmail">
        <el-input v-model="createForm.adminEmail" placeholder="企业管理员登录邮箱" autocomplete="off" />
      </el-form-item>
      <el-form-item label="初始密码" prop="adminPassword">
        <el-input v-model="createForm.adminPassword" type="password" show-password />
      </el-form-item>
      <el-form-item label="管理员姓名">
        <el-input v-model="createForm.adminName" maxlength="64" placeholder="选填" />
      </el-form-item>
      <el-form-item label="套餐">
        <el-select v-model="createForm.planName" class="w-full">
          <el-option v-for="item in planNameDict" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
      </el-form-item>
      <el-form-item label="有效开始">
        <el-date-picker
          v-model="createForm.currentPeriodStart"
          type="datetime"
          value-format="YYYY-MM-DDTHH:mm:ss.SSS[Z]"
          clearable
          placeholder="留空则按套餐自动计算"
          class="w-full"
        />
      </el-form-item>
      <el-form-item label="有效结束">
        <el-date-picker
          v-model="createForm.currentPeriodEnd"
          type="datetime"
          value-format="YYYY-MM-DDTHH:mm:ss.SSS[Z]"
          clearable
          placeholder="留空则按套餐自动计算"
          class="w-full"
        />
      </el-form-item>
    </el-form>

    <el-form v-else-if="editForm" label-width="100px">
      <el-form-item label="企业名称">
        <el-input v-model="editForm.name" maxlength="120" />
      </el-form-item>
      <el-form-item label="套餐">
        <el-select v-model="editForm.planName" class="w-full">
          <el-option v-for="item in planNameDict" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
      </el-form-item>
      <el-form-item label="月配额">
        <el-input-number v-model="editForm.monthlyArticleQuota" :min="1" class="w-full" />
      </el-form-item>
      <el-form-item label="订阅状态">
        <el-select v-model="editForm.subscriptionStatus" class="w-full">
          <el-option
            v-for="item in subscriptionStatusDict"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="企业状态">
        <el-select v-model="editForm.status" class="w-full">
          <el-option
            v-for="item in organizationStatusDict"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="有效开始">
        <el-date-picker
          v-model="editForm.currentPeriodStart"
          type="datetime"
          value-format="YYYY-MM-DDTHH:mm:ss.SSS[Z]"
          clearable
          class="w-full"
        />
      </el-form-item>
      <el-form-item label="有效结束">
        <el-date-picker
          v-model="editForm.currentPeriodEnd"
          type="datetime"
          value-format="YYYY-MM-DDTHH:mm:ss.SSS[Z]"
          clearable
          class="w-full"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="emit('update:visible', false)">取消</el-button>
      <el-button v-if="mode === 'edit' && canManage" @click="handleRenew">续期</el-button>
      <el-button type="primary" :loading="saving" @click="submit">
        {{ mode === "create" ? "创建" : "保存" }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from "vue";
import type { FormInstance, FormRules } from "element-plus";
import { ElMessageBox } from "element-plus";
import {
  createTenant,
  renewTenant,
  updateTenant,
  type CreateTenantPayload,
  type TenantDetail,
  type TenantItem,
  type UpdateTenantPayload
} from "@/api/console/index";
import {
  organizationStatusDict,
  planNameDict,
  subscriptionStatusDict
} from "@/constants/dicts/platform";
import { message } from "@/utils/message";

defineOptions({ name: "TenantEditDialog" });

const props = defineProps<{
  visible: boolean;
  mode: "create" | "edit";
  tenant?: TenantItem | TenantDetail | null;
  organizationId?: string;
  canManage?: boolean;
}>();

const emit = defineEmits<{
  "update:visible": [value: boolean];
  success: [];
}>();

const saving = ref(false);
const createFormRef = ref<FormInstance>();
const createForm = reactive({
  organizationName: "",
  adminEmail: "",
  adminPassword: "",
  adminName: "",
  planName: "trial",
  currentPeriodStart: null as string | null,
  currentPeriodEnd: null as string | null
});
const createRules: FormRules = {
  organizationName: [{ required: true, message: "请输入企业名称", trigger: "blur" }],
  adminEmail: [{ required: true, message: "请输入管理员邮箱", trigger: "blur" }],
  adminPassword: [
    { required: true, message: "请输入初始密码", trigger: "blur" },
    { min: 6, message: "密码至少 6 位", trigger: "blur" }
  ]
};

const editForm = ref<UpdateTenantPayload & { name: string } | null>(null);

watch(
  () => [props.visible, props.mode, props.tenant] as const,
  ([visible, mode, tenant]) => {
    if (!visible) return;
    if (mode === "create") {
      createForm.organizationName = "";
      createForm.adminEmail = "";
      createForm.adminPassword = "";
      createForm.adminName = "";
      createForm.planName = "trial";
      createForm.currentPeriodStart = null;
      createForm.currentPeriodEnd = null;
      return;
    }
    if (tenant) {
      editForm.value = {
        name: tenant.name,
        planName: tenant.planName,
        monthlyArticleQuota: tenant.monthlyArticleQuota,
        subscriptionStatus: tenant.subscriptionStatus,
        status: tenant.status,
        currentPeriodStart: tenant.currentPeriodStart,
        currentPeriodEnd: tenant.currentPeriodEnd
      };
    }
  },
  { immediate: true }
);

async function submitCreate() {
  if (!createFormRef.value) return;
  await createFormRef.value.validate(async (valid) => {
    if (!valid) return;
    saving.value = true;
    try {
      const payload: CreateTenantPayload = {
        organizationName: createForm.organizationName.trim(),
        adminEmail: createForm.adminEmail.trim(),
        adminPassword: createForm.adminPassword,
        adminName: createForm.adminName.trim() || undefined,
        planName: createForm.planName,
        currentPeriodStart: createForm.currentPeriodStart || undefined,
        currentPeriodEnd: createForm.currentPeriodEnd || undefined
      };
      await createTenant(payload);
      message("租户已创建", { type: "success" });
      emit("update:visible", false);
      emit("success");
    } finally {
      saving.value = false;
    }
  });
}

async function submitEdit() {
  const orgId = props.organizationId ?? props.tenant?.id;
  if (!editForm.value || !orgId) return;
  saving.value = true;
  try {
    await updateTenant(orgId, { ...editForm.value });
    message("租户已更新", { type: "success" });
    emit("update:visible", false);
    emit("success");
  } finally {
    saving.value = false;
  }
}

async function handleRenew() {
  const orgId = props.organizationId ?? props.tenant?.id;
  if (!orgId) return;
  try {
    await ElMessageBox.confirm("确认续期该租户账期？", "续期账期", {
      type: "warning",
      confirmButtonText: "确认续期",
      cancelButtonText: "取消"
    });
  } catch {
    return;
  }
  await renewTenant(orgId);
  message("账期已续期", { type: "success" });
  emit("success");
}

function submit() {
  if (props.mode === "create") {
    void submitCreate();
  } else {
    void submitEdit();
  }
}
</script>
