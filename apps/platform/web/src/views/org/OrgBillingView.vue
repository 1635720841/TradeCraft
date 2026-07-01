<!--
  订阅与用量页：配额摘要与用量明细（只读；续期/加购由平台 Console 操作）。
-->
<template>
  <AdminPageShell title="订阅与用量" description="续期与加购需由平台管理员审批。">
    <template #actions>
      <el-button link type="primary" :loading="quotaAsync.loading.value" @click="quotaAsync.retry">
        刷新
      </el-button>
      <el-dropdown trigger="click">
        <el-button size="small">
          更多
          <el-icon class="el-icon--right"><ArrowDown /></el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item @click="downloadBillingUsageCsv">导出 CSV</el-dropdown-item>
            <el-dropdown-item @click="requestRenew">申请续费</el-dropdown-item>
            <el-dropdown-item @click="openUpgradeDialog">申请升级</el-dropdown-item>
            <el-dropdown-item @click="openTopUpDialog">申请加购</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </template>

    <el-alert
      class="mb-4"
      type="info"
      :closable="false"
      show-icon
      title="续期与加购可通过「更多」菜单提交，由平台管理员审批。"
    />

    <el-alert
      v-if="quotaAsync.error.value"
      type="error"
      :title="quotaAsync.error.value"
      show-icon
      class="mb-4"
    >
      <template #default>
        <el-button type="primary" link @click="quotaAsync.retry">重试</el-button>
      </template>
    </el-alert>

    <template v-if="profile">
      <QuotaSummaryCard :quota="profile.quota" class="mb-4" />

      <el-alert
        v-if="profile.quota.subscriptionActive === false"
        class="mb-4"
        type="error"
        :closable="false"
        show-icon
        title="企业有效期已过，请联系平台管理员续期后继续使用。"
      />

      <el-alert
        v-else-if="quotaLowWarning"
        class="mb-4"
        type="warning"
        :closable="false"
        show-icon
        :title="quotaLowWarning"
      />

      <div class="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div class="text-sm text-gray-500">套餐</div>
          <div class="text-2xl font-medium">
            {{ dictLabel(planNameDict, profile.planName) }}
          </div>
        </div>
        <div>
          <div class="text-sm text-gray-500">订阅状态</div>
          <div class="text-2xl font-medium">
            <el-tag :type="dictTagType(subscriptionStatusDict, profile.subscriptionStatus)">
              {{ dictLabel(subscriptionStatusDict, profile.subscriptionStatus) }}
            </el-tag>
          </div>
        </div>
        <el-statistic title="月配额" :value="profile.monthlyArticleQuota" suffix="篇" />
        <el-statistic title="剩余可用" :value="profile.quota.remaining" suffix="篇" />
      </div>

      <div class="mb-4 rounded-lg border border-gray-100 bg-gray-50/80 px-4 py-3">
        <div class="text-sm text-gray-500">企业有效时间</div>
        <div class="mt-1 text-lg font-medium">
          {{ formatPeriodWindow(profile.currentPeriodStart, profile.currentPeriodEnd) }}
        </div>
        <div
          v-if="profile.quota.daysRemaining != null && profile.currentPeriodEnd"
          class="mt-1 text-sm"
          :class="profile.quota.subscriptionActive ? 'text-gray-500' : 'text-red-500'"
        >
          {{
            profile.quota.subscriptionActive
              ? `剩余 ${profile.quota.daysRemaining} 天`
              : "已过期"
          }}
        </div>
      </div>
    </template>

    <el-divider />

    <div v-loading="usageAsync.loading.value" class="space-y-4">
      <div class="font-medium">用量明细</div>
      <el-alert
        v-if="usageAsync.error.value"
        type="error"
        :title="usageAsync.error.value"
        show-icon
      >
        <template #default>
          <el-button type="primary" link @click="fetchUsage">重试</el-button>
        </template>
      </el-alert>
      <el-empty
        v-else-if="!usageAsync.loading.value && items.length === 0"
        description="暂无用量记录"
      />
      <template v-else-if="items.length > 0">
        <el-table :data="items" stripe>
          <el-table-column prop="createdAt" label="时间" min-width="170">
            <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column prop="serviceType" label="服务类型" width="120">
            <template #default="{ row }">
              <el-tag :type="dictTagType(billingServiceTypeDict, row.serviceType)">
                {{ dictLabel(billingServiceTypeDict, row.serviceType) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="provider" label="提供方" width="100" />
          <el-table-column prop="tokensOrCount" label="用量" width="90" align="right" />
          <el-table-column prop="estimatedCost" label="预估费用" width="110" align="right">
            <template #default="{ row }">${{ Number(row.estimatedCost ?? 0).toFixed(2) }}</template>
          </el-table-column>
          <el-table-column prop="projectType" label="项目类型" width="120">
            <template #default="{ row }">{{ row.projectType || "-" }}</template>
          </el-table-column>
        </el-table>
        <div class="flex justify-end">
          <el-pagination
            v-model:current-page="page"
            v-model:page-size="limit"
            :total="total"
            :page-sizes="[10, 20, 50]"
            layout="total, sizes, prev, pager, next"
            @current-change="fetchUsage"
            @size-change="onSizeChange"
          />
        </div>
      </template>
    </div>

    <el-divider />

    <div v-loading="requestsAsync.loading.value" class="space-y-4">
      <div class="font-medium">申请记录</div>
      <el-empty
        v-if="!requestsAsync.loading.value && !requestsAsync.error.value && billingRequests.length === 0"
        description="暂无申请记录"
      >
        <el-button type="primary" size="small" @click="requestRenew">申请续费</el-button>
      </el-empty>
      <el-table v-else-if="billingRequests.length > 0" :data="billingRequests" stripe>
        <el-table-column prop="type" label="类型" width="100">
          <template #default="{ row }">
            {{ dictLabel(billingChangeRequestTypeDict, row.type) || row.type }}
          </template>
        </el-table-column>
        <el-table-column prop="message" label="说明" min-width="160">
          <template #default="{ row }">{{ row.message || "-" }}</template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="dictTagType(billingChangeRequestStatusDict, row.status)">
              {{ dictLabel(billingChangeRequestStatusDict, row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="申请时间" min-width="170">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="upgradeVisible" title="申请升级套餐" width="420px">
      <el-form label-width="80px">
        <el-form-item label="目标套餐">
          <el-select v-model="upgradePlanId" class="w-full" placeholder="选择套餐">
            <el-option
              v-for="plan in plans"
              :key="plan.id"
              :label="dictLabel(planNameDict, plan.name)"
              :value="plan.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="upgradeMessage" type="textarea" maxlength="200" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="upgradeVisible = false">取消</el-button>
        <el-button type="primary" :loading="submittingRequest" @click="submitUpgrade">
          提交
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="topUpVisible" title="申请加购配额" width="420px">
      <el-form label-width="80px">
        <el-form-item label="加购篇数">
          <el-input-number v-model="topUpAmount" :min="1" :max="100000" class="w-full" />
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="topUpMessage" type="textarea" maxlength="200" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="topUpVisible = false">取消</el-button>
        <el-button type="primary" :loading="submittingRequest" @click="submitTopUp">
          提交
        </el-button>
      </template>
    </el-dialog>
  </AdminPageShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ArrowDown } from "@element-plus/icons-vue";
import AdminPageShell from "@/components/layout/AdminPageShell.vue";
import QuotaSummaryCard from "@/components/org/QuotaSummaryCard.vue";
import { useAsyncData } from "@/composables/useAsyncData";
import { getOrganizationProfile, type OrganizationProfile } from "@/api/org/organization";
import {
  listBillingUsage,
  createBillingRequest,
  downloadBillingUsageCsv,
  listBillingPlans,
  listBillingRequests,
  type BillingRequestItem,
  type CreditUsageItem,
  type SubscriptionPlan
} from "@/api/org/billing";
import { message } from "@/utils/message";
import { billingServiceTypeDict } from "@/constants/dicts/billing";
import {
  billingChangeRequestTypeDict,
  billingChangeRequestStatusDict,
  planNameDict,
  subscriptionStatusDict
} from "@/constants/dicts/platform";
import { dictLabel, dictTagType } from "@/utils/dict";
import { formatPeriodWindow } from "@/utils/period";

defineOptions({ name: "OrgBillingView" });

const submittingRequest = ref(false);
const items = ref<CreditUsageItem[]>([]);
const billingRequests = ref<BillingRequestItem[]>([]);
const plans = ref<SubscriptionPlan[]>([]);
const page = ref(1);
const limit = ref(20);
const total = ref(0);
const upgradeVisible = ref(false);
const topUpVisible = ref(false);
const upgradePlanId = ref("");
const upgradeMessage = ref("");
const topUpAmount = ref(100);
const topUpMessage = ref("");

const quotaAsync = useAsyncData(() => getOrganizationProfile());
const profile = computed(() => quotaAsync.data.value);

const usageAsync = useAsyncData(async () => {
  const result = await listBillingUsage(page.value, limit.value);
  items.value = result.items;
  total.value = result.pagination.total;
  page.value = result.pagination.page;
  limit.value = result.pagination.limit;
  return result;
});

const requestsAsync = useAsyncData(async () => {
  billingRequests.value = (await listBillingRequests()).items;
  return billingRequests.value;
});

const quotaLowWarning = computed(() => {
  const quota = profile.value?.quota;
  if (!quota || quota.subscriptionActive === false) return "";
  const totalQuota = quota.periodQuota;
  if (totalQuota <= 0) return "";
  const remaining = quota.remaining;
  const percent = Math.round((remaining / totalQuota) * 100);
  if (remaining < 10 || percent < 20) {
    return `本月内容配额即将用尽（剩余 ${remaining} 篇，约 ${percent}%），请联系平台管理员续期或加购。`;
  }
  return "";
});

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("zh-CN");
}

async function fetchUsage() {
  await usageAsync.load();
}

function onSizeChange() {
  page.value = 1;
  void fetchUsage();
}

async function requestRenew() {
  try {
    await createBillingRequest({ type: "RENEW", message: "申请续费" });
    message("续费申请已提交", { type: "success" });
    await requestsAsync.load();
  } catch {
    // global HTTP interceptor shows API errors
  }
}

async function loadPlans() {
  try {
    plans.value = await listBillingPlans();
  } catch {
    plans.value = [];
  }
}

function openUpgradeDialog() {
  upgradePlanId.value = plans.value[0]?.id ?? "";
  upgradeMessage.value = "";
  upgradeVisible.value = true;
}

function openTopUpDialog() {
  topUpAmount.value = 100;
  topUpMessage.value = "";
  topUpVisible.value = true;
}

async function submitUpgrade() {
  if (!upgradePlanId.value) {
    message("请选择目标套餐", { type: "warning" });
    return;
  }
  submittingRequest.value = true;
  try {
    await createBillingRequest({
      type: "UPGRADE",
      targetPlanId: upgradePlanId.value,
      message: upgradeMessage.value.trim() || "申请升级套餐"
    });
    message("升级申请已提交", { type: "success" });
    upgradeVisible.value = false;
    await requestsAsync.load();
  } catch {
    // global HTTP interceptor shows API errors
  } finally {
    submittingRequest.value = false;
  }
}

async function submitTopUp() {
  submittingRequest.value = true;
  try {
    await createBillingRequest({
      type: "TOPUP",
      topUpAmount: topUpAmount.value,
      message: topUpMessage.value.trim() || `申请加购 ${topUpAmount.value} 篇`
    });
    message("加购申请已提交", { type: "success" });
    topUpVisible.value = false;
    await requestsAsync.load();
  } catch {
    // global HTTP interceptor shows API errors
  } finally {
    submittingRequest.value = false;
  }
}

onMounted(async () => {
  await Promise.all([quotaAsync.load(), fetchUsage(), requestsAsync.load(), loadPlans()]);
});
</script>
