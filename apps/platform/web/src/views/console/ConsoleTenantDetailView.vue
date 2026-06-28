<!--
  租户详情页：基本信息、成员、订阅配额与快捷操作。
-->
<template>
  <div class="p-4 space-y-4">
    <div class="flex items-center gap-2">
      <el-button link type="primary" @click="router.back()">← 返回</el-button>
      <span class="text-lg font-medium">{{ tenant?.name ?? "租户详情" }}</span>
    </div>

    <el-card v-loading="loading" shadow="never">
      <template v-if="tenant">
        <div v-if="canManageTenant" class="mb-4 flex flex-wrap gap-2">
          <el-button type="primary" @click="openEdit">编辑</el-button>
          <el-button @click="handleRenew">续期</el-button>
          <el-button @click="openTopUp">加购配额</el-button>
        </div>

        <el-descriptions :column="2" border class="mb-4">
          <el-descriptions-item label="企业 ID">{{ tenant.id }}</el-descriptions-item>
          <el-descriptions-item label="状态">{{ tenant.status }}</el-descriptions-item>
          <el-descriptions-item label="套餐">
            {{ dictLabel(planNameDict, tenant.planName) }}
          </el-descriptions-item>
          <el-descriptions-item label="订阅">
            <el-tag :type="dictTagType(subscriptionStatusDict, tenant.subscriptionStatus)">
              {{ dictLabel(subscriptionStatusDict, tenant.subscriptionStatus) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="月配额">
            {{ tenant.monthlyArticleQuota }} 篇
            <span v-if="tenant.articleQuotaBonus" class="text-gray-500">
              （加购 {{ tenant.articleQuotaBonus }}）
            </span>
          </el-descriptions-item>
          <el-descriptions-item label="企业有效时间">
            {{ formatPeriodWindow(tenant.currentPeriodStart, tenant.currentPeriodEnd) }}
          </el-descriptions-item>
          <el-descriptions-item label="成员数">{{ tenant.memberCount }}</el-descriptions-item>
          <el-descriptions-item label="项目数">{{ tenant.projectCount }}</el-descriptions-item>
        </el-descriptions>

        <div v-if="tenant.quota" class="mb-4">
          <div class="mb-2 text-sm font-medium text-gray-700">本账期配额</div>
          <el-progress
            :percentage="quotaPercent"
            :status="quotaPercent >= 90 ? 'exception' : undefined"
          >
            <span class="text-sm">
              {{ tenant.quota.reservedTotal }} / {{ tenant.quota.periodQuota }} 篇
            </span>
          </el-progress>
        </div>

        <div class="font-medium mb-2">成员列表</div>
        <el-table :data="tenant.members ?? []" stripe>
          <el-table-column prop="email" label="邮箱" min-width="180" />
          <el-table-column prop="name" label="姓名" min-width="120">
            <template #default="{ row }">{{ row.name || "-" }}</template>
          </el-table-column>
          <el-table-column prop="role" label="角色" width="120">
            <template #default="{ row }">
              <el-tag :type="dictTagType(memberRoleDict, row.role)">
                {{ dictLabel(memberRoleDict, row.role) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="createdAt" label="加入时间" min-width="170">
            <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
          </el-table-column>
        </el-table>
      </template>
    </el-card>

    <el-card v-loading="loadingAudit" shadow="never">
      <template #header>
        <span class="font-medium">近期操作记录</span>
      </template>
      <el-table :data="auditItems" stripe>
        <el-table-column prop="createdAt" label="时间" min-width="170">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column prop="action" label="操作" min-width="160" />
        <el-table-column prop="actorEmail" label="操作人" min-width="160">
          <template #default="{ row }">{{ row.actorEmail || row.actorUserId }}</template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="editVisible" title="编辑租户" width="480px" destroy-on-close>
      <el-form v-if="editForm" label-width="100px">
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
            <el-option label="正常" value="ACTIVE" />
            <el-option label="停用" value="SUSPENDED" />
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
        <el-button type="primary" :loading="saving" @click="submitEdit">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="topUpVisible" title="加购配额" width="400px" destroy-on-close>
      <el-form label-width="80px">
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
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessageBox } from "element-plus";
import {
  addTenantQuotaTopUp,
  getTenant,
  listAuditLogs,
  renewTenant,
  updateTenant,
  type AuditLogItem,
  type TenantDetail
} from "@/api/console/index";
import { memberRoleDict, planNameDict, subscriptionStatusDict } from "@/constants/dicts/platform";
import { dictLabel, dictTagType } from "@/utils/dict";
import { hasPerms } from "@/utils/auth";
import { formatPeriodWindow } from "@/utils/period";
import { message } from "@/utils/message";

defineOptions({ name: "ConsoleTenantDetailView" });

const canManageTenant = computed(() => hasPerms("console:tenant:update"));

const route = useRoute();
const router = useRouter();
const orgId = computed(() => route.params.organizationId as string);

const loading = ref(false);
const loadingAudit = ref(false);
const saving = ref(false);
const tenant = ref<TenantDetail | null>(null);
const auditItems = ref<AuditLogItem[]>([]);

const editVisible = ref(false);
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
const topUpAmount = ref(100);
const topUpNote = ref("");

const quotaPercent = computed(() => {
  const quota = tenant.value?.quota;
  if (!quota?.periodQuota) return 0;
  return Math.min(100, Math.round((quota.reservedTotal / quota.periodQuota) * 100));
});

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("zh-CN");
}

async function loadTenant() {
  loading.value = true;
  try {
    tenant.value = (await getTenant(orgId.value)) as TenantDetail;
  } finally {
    loading.value = false;
  }
}

async function loadAudit() {
  loadingAudit.value = true;
  try {
    const result = await listAuditLogs(1, 10, { organizationId: orgId.value });
    auditItems.value = result.items;
  } finally {
    loadingAudit.value = false;
  }
}

function openEdit() {
  if (!tenant.value) return;
  editForm.value = {
    name: tenant.value.name,
    planName: tenant.value.planName,
    monthlyArticleQuota: tenant.value.monthlyArticleQuota,
    subscriptionStatus: tenant.value.subscriptionStatus,
    status: tenant.value.status,
    currentPeriodStart: tenant.value.currentPeriodStart,
    currentPeriodEnd: tenant.value.currentPeriodEnd
  };
  editVisible.value = true;
}

async function submitEdit() {
  if (!editForm.value) return;
  saving.value = true;
  try {
    await updateTenant(orgId.value, { ...editForm.value });
    message("租户已更新", { type: "success" });
    editVisible.value = false;
    await Promise.all([loadTenant(), loadAudit()]);
  } finally {
    saving.value = false;
  }
}

async function handleRenew() {
  try {
    await ElMessageBox.confirm("确认续期该租户账期？", "续期账期", {
      type: "warning",
      confirmButtonText: "确认续期",
      cancelButtonText: "取消"
    });
  } catch {
    return;
  }
  await renewTenant(orgId.value);
  message("账期已续期", { type: "success" });
  await Promise.all([loadTenant(), loadAudit()]);
}

function openTopUp() {
  topUpAmount.value = 100;
  topUpNote.value = "";
  topUpVisible.value = true;
}

async function submitTopUp() {
  try {
    await ElMessageBox.confirm(
      `确认为该租户加购 ${topUpAmount.value} 篇文章配额？`,
      "加购配额",
      { type: "warning", confirmButtonText: "确认", cancelButtonText: "取消" }
    );
  } catch {
    return;
  }
  saving.value = true;
  try {
    await addTenantQuotaTopUp(orgId.value, topUpAmount.value, topUpNote.value.trim() || undefined);
    message("配额加购成功", { type: "success" });
    topUpVisible.value = false;
    await Promise.all([loadTenant(), loadAudit()]);
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  await Promise.all([loadTenant(), loadAudit()]);
});
</script>
