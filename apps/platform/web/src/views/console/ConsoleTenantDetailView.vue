<!--
  租户详情页：订阅配额、账号概览（只读）与运营操作。
-->
<template>
  <div class="p-4 space-y-4">
    <div class="flex items-center gap-2">
      <el-button link type="primary" @click="router.back()">← 返回</el-button>
      <span class="text-lg font-medium">{{ tenant?.name ?? "租户详情" }}</span>
    </div>

    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="平台运营仅管理租户开户、套餐与配额；成员增删、角色与细粒度权限由该企业在「企业管理 → 成员与权限」自行维护。"
    />

    <template v-if="tenant">
      <el-card v-loading="loading" shadow="never">
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="font-medium">订阅与配额</span>
            <div v-if="canManageTenant" class="flex flex-wrap gap-2">
              <el-button type="primary" @click="editVisible = true">编辑</el-button>
              <el-button @click="topUpVisible = true">加购配额</el-button>
            </div>
          </div>
        </template>

        <el-descriptions :column="2" border class="mb-4">
          <el-descriptions-item label="企业 ID">{{ tenant.id }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            {{ dictLabel(organizationStatusDict, tenant.status) }}
          </el-descriptions-item>
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
            <span v-if="tenant.articleQuotaBonus" class="mw-text-muted">
              （加购 {{ tenant.articleQuotaBonus }}）
            </span>
          </el-descriptions-item>
          <el-descriptions-item label="企业有效时间">
            {{ formatPeriodWindow(tenant.currentPeriodStart, tenant.currentPeriodEnd) }}
          </el-descriptions-item>
          <el-descriptions-item label="账号数">{{ tenant.memberCount }}</el-descriptions-item>
          <el-descriptions-item label="项目数">{{ tenant.projectCount }}</el-descriptions-item>
        </el-descriptions>

        <div v-if="tenant.quota">
          <div class="mb-2 text-sm font-medium mw-text-body">本账期配额</div>
          <el-progress
            :percentage="quotaPercent"
            :status="quotaPercent >= 90 ? 'exception' : undefined"
          >
            <span class="text-sm">
              {{ tenant.quota.reservedTotal }} / {{ tenant.quota.periodQuota }} 篇
            </span>
          </el-progress>
        </div>
      </el-card>

      <el-card v-loading="loading" shadow="never">
        <template #header>
          <span class="font-medium">账号概览（只读）</span>
        </template>

        <div v-if="adminMembers.length" class="mb-4">
          <div class="mb-2 text-sm font-medium mw-text-body">企业管理员</div>
          <el-table :data="adminMembers" stripe>
            <el-table-column prop="email" label="邮箱" min-width="180" />
            <el-table-column prop="name" label="姓名" min-width="120">
              <template #default="{ row }">{{ row.name || "-" }}</template>
            </el-table-column>
            <el-table-column prop="createdAt" label="加入时间" min-width="170">
              <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
            </el-table-column>
            <el-table-column v-if="canImpersonate" label="运营操作" width="100" fixed="right">
              <template #default="{ row }">
                <el-button
                  link
                  type="primary"
                  :loading="impersonatingUserId === row.id"
                  @click="handleImpersonate(row)"
                >
                  代登录
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <el-collapse v-if="otherMembers.length">
          <el-collapse-item :title="`其他成员（${otherMembers.length}）`" name="others">
            <el-table :data="otherMembers" stripe>
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
              <el-table-column v-if="canImpersonate" label="运营操作" width="100" fixed="right">
                <template #default="{ row }">
                  <el-button
                    link
                    type="primary"
                    :loading="impersonatingUserId === row.id"
                    @click="handleImpersonate(row)"
                  >
                    代登录
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
          </el-collapse-item>
        </el-collapse>

        <el-empty
          v-if="!tenant.members?.length"
          description="暂无账号"
          :image-size="64"
        />
      </el-card>
    </template>

    <el-card v-loading="loadingAudit" shadow="never">
      <template #header>
        <div class="flex items-center justify-between">
          <span class="font-medium">近期操作记录</span>
          <router-link
            :to="`/console/audit?organizationId=${orgId}`"
            class="text-primary text-sm"
          >
            查看全部
          </router-link>
        </div>
      </template>
      <el-table :data="auditItems" stripe>
        <el-table-column prop="createdAt" label="时间" min-width="170">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column prop="action" label="操作" min-width="160">
          <template #default="{ row }">{{ dictLabel(auditActionDict, row.action) || row.action }}</template>
        </el-table-column>
        <el-table-column prop="actorEmail" label="操作人" min-width="160">
          <template #default="{ row }">{{ row.actorEmail || row.actorUserId }}</template>
        </el-table-column>
      </el-table>
    </el-card>

    <TenantEditDialog
      v-model:visible="editVisible"
      mode="edit"
      :tenant="tenant"
      :organization-id="orgId"
      :can-manage="canManageTenant"
      @success="onTenantUpdated"
    />

    <TenantTopUpDialog
      v-model:visible="topUpVisible"
      :organization-id="orgId"
      :tenant-name="tenant?.name"
      @success="onTenantUpdated"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessageBox } from "element-plus";
import { useUserStoreHook } from "@/store/modules/user";
import {
  getTenant,
  impersonateUser,
  listAuditLogs,
  type AuditLogItem,
  type TenantDetail,
  type TenantMember
} from "@/api/console/index";
import {
  auditActionDict,
  memberRoleDict,
  organizationStatusDict,
  planNameDict,
  subscriptionStatusDict
} from "@/constants/dicts/platform";
import { dictLabel, dictTagType } from "@/utils/dict";
import { hasPerms } from "@/utils/auth";
import { startImpersonation } from "@/utils/impersonation";
import { formatPeriodWindow } from "@/utils/period";
import { message } from "@/utils/message";
import TenantEditDialog from "./components/TenantEditDialog.vue";
import TenantTopUpDialog from "./components/TenantTopUpDialog.vue";

defineOptions({ name: "ConsoleTenantDetailView" });

const canManageTenant = computed(() => hasPerms("console:tenant:update"));
const userStore = useUserStoreHook();
const canImpersonate = computed(() => userStore.roles.includes("super_admin"));

const route = useRoute();
const router = useRouter();
const orgId = computed(() => route.params.organizationId as string);

const loading = ref(false);
const loadingAudit = ref(false);
const tenant = ref<TenantDetail | null>(null);
const auditItems = ref<AuditLogItem[]>([]);
const editVisible = ref(false);
const topUpVisible = ref(false);
const impersonatingUserId = ref<string | null>(null);

const adminMembers = computed(() =>
  (tenant.value?.members ?? []).filter((m) => m.role === "ADMIN")
);

const otherMembers = computed(() =>
  (tenant.value?.members ?? []).filter((m) => m.role !== "ADMIN")
);

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
    tenant.value = await getTenant(orgId.value);
  } finally {
    loading.value = false;
  }
}

async function loadAudit() {
  loadingAudit.value = true;
  try {
    const result = await listAuditLogs(1, 3, { organizationId: orgId.value });
    auditItems.value = result.items;
  } finally {
    loadingAudit.value = false;
  }
}

async function onTenantUpdated() {
  await Promise.all([loadTenant(), loadAudit()]);
}

async function handleImpersonate(member: TenantMember) {
  try {
    const { value: reason } = await ElMessageBox.prompt(
      `确认以 ${member.email} 身份代登录？将切换为租户视角（15 分钟有效）。`,
      "代登录",
      {
        confirmButtonText: "确认",
        cancelButtonText: "取消",
        inputPlaceholder: "请填写代登录原因（审计用）",
        inputValidator: (v) => (v?.trim() ? true : "请填写原因")
      }
    );
    impersonatingUserId.value = member.id;
    const result = await impersonateUser(member.id, reason.trim());
    await startImpersonation(result.accessToken, result.expires, result.targetEmail);
    message(`已切换为 ${result.targetEmail}`, { type: "success" });
    await router.push("/welcome");
  } catch {
    /* 用户取消 */
  } finally {
    impersonatingUserId.value = null;
  }
}

onMounted(async () => {
  await Promise.all([loadTenant(), loadAudit()]);
});
</script>
