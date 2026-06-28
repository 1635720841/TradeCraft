<!--
  订阅与用量页：配额摘要、用量明细与续期操作。
-->
<template>
  <div class="p-4 space-y-4">
    <el-card v-loading="loadingQuota" shadow="never">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="font-medium">订阅与配额</span>
          <div class="flex gap-2">
            <el-button v-if="canManage" @click="openTopUp">加购配额</el-button>
            <el-button v-if="canManage" type="primary" @click="handleRenew">
              续期
            </el-button>
            <el-button link type="primary" @click="refreshQuota">刷新</el-button>
          </div>
        </div>
      </template>

      <el-alert
        v-if="canRead && !canManage"
        class="mb-4"
        type="info"
        :closable="false"
        show-icon
        title="当前仅有查看权限，续期与加购需「管理订阅与配额」权限。"
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
        <el-button type="primary" :loading="topUpSaving" @click="submitTopUp">确认</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ElMessageBox } from "element-plus";
import { getOrganizationProfile, type OrganizationProfile } from "@/api/org/organization";
import {
  addQuotaTopUp,
  listBillingUsage,
  renewBillingPeriod,
  type CreditUsageItem
} from "@/api/org/billing";
import { billingServiceTypeDict } from "@/constants/dicts/billing";
import {
  planNameDict,
  subscriptionStatusDict
} from "@/constants/dicts/platform";
import { dictLabel, dictTagType } from "@/utils/dict";
import { hasPerms } from "@/utils/auth";
import { formatPeriodWindow } from "@/utils/period";
import { message } from "@/utils/message";

defineOptions({ name: "OrgBillingView" });

const loadingQuota = ref(false);
const loadingUsage = ref(false);
const topUpSaving = ref(false);
const profile = ref<OrganizationProfile | null>(null);
const items = ref<CreditUsageItem[]>([]);
const page = ref(1);
const limit = ref(20);
const total = ref(0);
const topUpVisible = ref(false);
const topUpAmount = ref(100);
const topUpNote = ref("");

const canRead = computed(() => hasPerms("org:billing:read"));
const canManage = computed(() => hasPerms("org:billing:manage"));

const quotaPercent = computed(() => {
  const quota = profile.value?.quota;
  if (!quota?.periodQuota) return 0;
  return Math.min(
    100,
    Math.round((quota.reservedTotal / quota.periodQuota) * 100)
  );
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

function openTopUp() {
  topUpAmount.value = 100;
  topUpNote.value = "";
  topUpVisible.value = true;
}

async function submitTopUp() {
  try {
    await ElMessageBox.confirm(
      `确认为本账期加购 ${topUpAmount.value} 篇文章配额？`,
      "加购配额",
      { type: "warning", confirmButtonText: "确认加购", cancelButtonText: "取消" }
    );
  } catch {
    return;
  }
  topUpSaving.value = true;
  try {
    await addQuotaTopUp(topUpAmount.value, topUpNote.value.trim() || undefined);
    message("配额加购成功", { type: "success" });
    topUpVisible.value = false;
    await refreshQuota();
  } finally {
    topUpSaving.value = false;
  }
}

async function handleRenew() {
  try {
    await ElMessageBox.confirm(
      "确认续期当前账期？续期后将重置本账期用量统计。",
      "续期账期",
      { type: "warning", confirmButtonText: "确认续期", cancelButtonText: "取消" }
    );
  } catch {
    return;
  }
  await renewBillingPeriod();
  message("账期已续期", { type: "success" });
  await refreshQuota();
}

onMounted(async () => {
  await Promise.all([refreshQuota(), fetchUsage()]);
});
</script>
