<!--
  租户管理页：平台超管跨租户管理。
-->
<template>
  <div class="p-4 space-y-4">
    <el-card v-loading="loading" shadow="never">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="font-medium">租户列表</span>
          <div class="flex gap-2">
            <el-input
              v-model="keyword"
              placeholder="搜索企业名或邮箱"
              clearable
              class="w-52"
              @keyup.enter="search"
            />
            <el-button @click="search">搜索</el-button>
            <el-button v-if="canCreateTenant" type="primary" @click="openCreate">新建租户</el-button>
          </div>
        </div>
      </template>

      <el-table :data="tenants" stripe>
        <el-table-column prop="name" label="企业名称" min-width="160" />
        <el-table-column prop="planName" label="套餐" width="100">
          <template #default="{ row }">
            {{ dictLabel(planNameDict, row.planName) }}
          </template>
        </el-table-column>
        <el-table-column prop="subscriptionStatus" label="订阅" width="100">
          <template #default="{ row }">
            <el-tag :type="dictTagType(subscriptionStatusDict, row.subscriptionStatus)">
              {{ dictLabel(subscriptionStatusDict, row.subscriptionStatus) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="memberCount" label="成员" width="80" align="center" />
        <el-table-column prop="monthlyArticleQuota" label="月配额" width="90" align="right" />
        <el-table-column label="有效至" width="110">
          <template #default="{ row }">
            {{ formatPeriodEnd(row.currentPeriodEnd) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <router-link
              :to="`/console/tenants/${row.id}`"
              class="mr-2 text-primary text-sm"
            >
              详情
            </router-link>
            <el-button v-if="canManageTenant" type="primary" link @click="openEdit(row as TenantItem)">编辑</el-button>
            <el-button v-if="canManageTenant" type="primary" link @click="openTopUp(row as TenantItem)">加购</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="mt-4 flex justify-end">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="limit"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @current-change="fetchList"
          @size-change="onSizeChange"
        />
      </div>
    </el-card>

    <el-dialog
      v-model="createVisible"
      title="新建租户"
      width="520px"
      destroy-on-close
    >
      <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-width="120px">
        <el-form-item label="企业名称" prop="organizationName">
          <el-input v-model="createForm.organizationName" maxlength="120" />
        </el-form-item>
        <el-form-item label="管理员邮箱" prop="adminEmail">
          <el-input
            v-model="createForm.adminEmail"
            placeholder="企业管理员登录邮箱"
            autocomplete="off"
          />
        </el-form-item>
        <el-form-item label="初始密码" prop="adminPassword">
          <el-input v-model="createForm.adminPassword" type="password" show-password />
        </el-form-item>
        <el-form-item label="管理员姓名">
          <el-input v-model="createForm.adminName" maxlength="64" placeholder="选填" />
        </el-form-item>
        <el-form-item label="套餐">
          <el-select v-model="createForm.planName" class="w-full">
            <el-option
              v-for="item in planNameDict"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
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
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitCreate">创建</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="editVisible" title="编辑租户" width="520px" destroy-on-close>
      <el-form v-if="editForm" label-width="120px">
        <el-form-item label="企业名称">
          <el-input v-model="editForm.name" maxlength="120" />
        </el-form-item>
        <el-form-item label="套餐">
          <el-select v-model="editForm.planName" class="w-full">
            <el-option
              v-for="item in planNameDict"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="月配额">
          <el-input-number v-model="editForm.monthlyArticleQuota" :min="1" :max="100000" />
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
        <el-button @click="editVisible = false">取消</el-button>
        <el-button v-if="canManageTenant" @click="handleRenew">续期</el-button>
        <el-button v-if="canManageTenant" type="primary" :loading="saving" @click="submitEdit">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="topUpVisible" title="加购配额" width="400px" destroy-on-close>
      <el-form label-width="80px">
        <el-form-item label="租户">
          <span>{{ topUpTenant?.name }}</span>
        </el-form-item>
        <el-form-item label="加购数量">
          <el-input-number v-model="topUpAmount" :min="1" :max="100000" class="w-full" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="topUpNote" maxlength="200" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="topUpVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitTopUp">确认</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import type { FormInstance, FormRules } from "element-plus";
import { ElMessageBox } from "element-plus";
import {
  addTenantQuotaTopUp,
  createTenant,
  listTenants,
  renewTenant,
  updateTenant,
  type TenantItem
} from "@/api/console/index";
import {
  organizationStatusDict,
  planNameDict,
  subscriptionStatusDict
} from "@/constants/dicts/platform";
import { dictLabel, dictTagType } from "@/utils/dict";
import { hasPerms } from "@/utils/auth";
import { formatPeriodEnd } from "@/utils/period";
import { message } from "@/utils/message";

defineOptions({ name: "ConsoleTenantsView" });

const canCreateTenant = computed(() => hasPerms("console:tenant:create"));
const canManageTenant = computed(() => hasPerms("console:tenant:update"));

const loading = ref(false);
const saving = ref(false);
const tenants = ref<TenantItem[]>([]);
const page = ref(1);
const limit = ref(20);
const total = ref(0);
const keyword = ref("");

const createVisible = ref(false);
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

const editVisible = ref(false);
const editingId = ref("");
const editForm = ref<{
  name: string;
  planName: string;
  monthlyArticleQuota: number;
  subscriptionStatus: string;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
} | null>(null);

const topUpVisible = ref(false);
const topUpTenant = ref<TenantItem | null>(null);
const topUpAmount = ref(100);
const topUpNote = ref("");

async function fetchList() {
  loading.value = true;
  try {
    const result = await listTenants(page.value, limit.value, keyword.value.trim());
    tenants.value = result.items;
    total.value = result.pagination.total;
    page.value = result.pagination.page;
    limit.value = result.pagination.limit;
  } finally {
    loading.value = false;
  }
}

function search() {
  page.value = 1;
  void fetchList();
}

function onSizeChange() {
  page.value = 1;
  void fetchList();
}

function openCreate() {
  createForm.organizationName = "";
  createForm.adminEmail = "";
  createForm.adminPassword = "";
  createForm.adminName = "";
  createForm.planName = "trial";
  createForm.currentPeriodStart = null;
  createForm.currentPeriodEnd = null;
  createVisible.value = true;
}

async function submitCreate() {
  if (!createFormRef.value) return;
  await createFormRef.value.validate(async valid => {
    if (!valid) return;
    saving.value = true;
    try {
      await createTenant({
        organizationName: createForm.organizationName.trim(),
        adminEmail: createForm.adminEmail.trim(),
        adminPassword: createForm.adminPassword,
        adminName: createForm.adminName.trim() || undefined,
        planName: createForm.planName,
        currentPeriodStart: createForm.currentPeriodStart || undefined,
        currentPeriodEnd: createForm.currentPeriodEnd || undefined
      });
      message("租户已创建", { type: "success" });
      createVisible.value = false;
      await fetchList();
    } finally {
      saving.value = false;
    }
  });
}

function openEdit(row: TenantItem) {
  editingId.value = row.id;
  editForm.value = {
    name: row.name,
    planName: row.planName,
    monthlyArticleQuota: row.monthlyArticleQuota,
    subscriptionStatus: row.subscriptionStatus,
    status: row.status,
    currentPeriodStart: row.currentPeriodStart,
    currentPeriodEnd: row.currentPeriodEnd
  };
  editVisible.value = true;
}

async function submitEdit() {
  if (!editForm.value || !editingId.value) return;
  saving.value = true;
  try {
    await updateTenant(editingId.value, { ...editForm.value });
    message("租户已更新", { type: "success" });
    editVisible.value = false;
    await fetchList();
  } finally {
    saving.value = false;
  }
}

async function handleRenew() {
  if (!editingId.value) return;
  try {
    await ElMessageBox.confirm("确认续期该租户账期？", "续期账期", {
      type: "warning",
      confirmButtonText: "确认续期",
      cancelButtonText: "取消"
    });
  } catch {
    return;
  }
  await renewTenant(editingId.value);
  message("账期已续期", { type: "success" });
  await fetchList();
}

function openTopUp(row: TenantItem) {
  topUpTenant.value = row;
  topUpAmount.value = 100;
  topUpNote.value = "";
  topUpVisible.value = true;
}

async function submitTopUp() {
  if (!topUpTenant.value) return;
  try {
    await ElMessageBox.confirm(
      `确认为租户加购 ${topUpAmount.value} 篇文章配额？`,
      "加购配额",
      { type: "warning", confirmButtonText: "确认", cancelButtonText: "取消" }
    );
  } catch {
    return;
  }
  saving.value = true;
  try {
    await addTenantQuotaTopUp(
      topUpTenant.value.id,
      topUpAmount.value,
      topUpNote.value.trim() || undefined
    );
    message("配额加购成功", { type: "success" });
    topUpVisible.value = false;
    await fetchList();
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void fetchList();
});
</script>
