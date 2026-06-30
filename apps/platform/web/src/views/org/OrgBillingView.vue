<!--
  订阅与用量页：配额摘要与用量明细（只读；续期/加购由平台 Console 操作）。
-->
<template>
  <div class="p-4 space-y-4">
    <el-card v-loading="loadingQuota" shadow="never">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="font-medium">订阅与配额</span>
          <el-button link type="primary" @click="refreshQuota">刷新</el-button>
          <el-button link type="primary" @click="downloadBillingUsageCsv">导出 CSV</el-button>
          <el-button type="primary" size="small" @click="requestRenew">申请续费</el-button>
          <el-button size="small" @click="openUpgradeDialog">申请升级</el-button>
          <el-button size="small" @click="openTopUpDialog">申请加购</el-button>
        </div>
      </template>

      <el-alert
        class="mb-4"
        type="info"
        :closable="false"
        show-icon
        title="续期与加购可通过下方「申请续费/升级」提交，由平台管理员审批。"
      />

      <template v-if="profile">
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
          <el-statistic
            title="剩余可用"
            :value="profile.quota.remaining"
            suffix="篇"
          />
        </div>

        <div class="mb-4 rounded-lg border border-gray-100 bg-gray-50/80 px-4 py-3">
          <div class="text-sm text-gray-500">套餐能力（只读）</div>
          <ul class="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
            <li>试用版：基础 SEO 工作台 + 按月篇数配额</li>
            <li>标准版：完整工作流 + CMS 发布 + GSC 嵌入</li>
            <li>企业版：更高配额 + Console 人工续期与加购</li>
          </ul>
          <p class="mt-2 text-xs text-gray-500">续期与加购请联系平台管理员，租户侧不可自助变更套餐。</p>
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

        <el-progress
          class="mb-4"
          :percentage="quotaPercent"
          :status="quotaPercent >= 90 ? 'exception' : undefined"
        />
      </template>
    </el-card>

    <el-card v-loading="loadingUsage" shadow="never">
      <template #header>
        <span class="font-medium">用量明细</span>
      </template>

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

      <div class="mt-4 flex justify-end">
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
    </el-card>

    <el-card v-loading="loadingRequests" shadow="never">
      <template #header>
        <span class="font-medium">申请记录</span>
      </template>
      <el-table :data="billingRequests" stripe>
        <el-table-column prop="type" label="类型" width="100">
          <template #default="{ row }">{{ dictLabel(billingChangeRequestTypeDict, row.type) || row.type }}</template>
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
    </el-card>

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
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
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

const loadingQuota = ref(false);
const loadingUsage = ref(false);
const loadingRequests = ref(false);
const submittingRequest = ref(false);
const profile = ref<OrganizationProfile | null>(null);
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

const quotaPercent = computed(() => {
  const quota = profile.value?.quota;
  if (!quota?.periodQuota) return 0;
  return Math.min(
    100,
    Math.round((quota.reservedTotal / quota.periodQuota) * 100)
  );
});

const quotaLowWarning = computed(() => {
  const quota = profile.value?.quota;
  if (!quota || quota.subscriptionActive === false) return "";
  const total = quota.periodQuota;
  if (total <= 0) return "";
  const remaining = quota.remaining;
  const percent = Math.round((remaining / total) * 100);
  if (remaining < 10 || percent < 20) {
    return `本月内容配额即将用尽（剩余 ${remaining} 篇，约 ${percent}%），请联系平台管理员续期或加购。`;
  }
  return "";
});

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("zh-CN");
}

async function refreshQuota() {
  loadingQuota.value = true;
  try {
    profile.value = await getOrganizationProfile();
  } finally {
    loadingQuota.value = false;
  }
}

async function fetchUsage() {
  loadingUsage.value = true;
  try {
    const result = await listBillingUsage(page.value, limit.value);
    items.value = result.items;
    total.value = result.pagination.total;
    page.value = result.pagination.page;
    limit.value = result.pagination.limit;
  } finally {
    loadingUsage.value = false;
  }
}

function onSizeChange() {
  page.value = 1;
  void fetchUsage();
}

async function requestRenew() {
  try {
    await createBillingRequest({ type: "RENEW", message: "申请续费" });
    message("续费申请已提交", { type: "success" });
    await loadRequests();
  } catch {
    message("提交失败", { type: "error" });
  }
}

function billingRequestStatusLabel(status: string) {
  if (status === "PENDING") return "待审批";
  if (status === "APPROVED") return "已通过";
  if (status === "REJECTED") return "已拒绝";
  return status;
}

function billingRequestStatusType(status: string) {
  if (status === "PENDING") return "warning";
  if (status === "APPROVED") return "success";
  if (status === "REJECTED") return "danger";
  return "info";
}

async function loadRequests() {
  loadingRequests.value = true;
  try {
    billingRequests.value = (await listBillingRequests()).items;
  } finally {
    loadingRequests.value = false;
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
    await loadRequests();
  } catch {
    message("提交失败", { type: "error" });
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
    await loadRequests();
  } catch {
    message("提交失败", { type: "error" });
  } finally {
    submittingRequest.value = false;
  }
}

onMounted(async () => {
  await Promise.all([refreshQuota(), fetchUsage(), loadRequests(), loadPlans()]);
});
</script>
