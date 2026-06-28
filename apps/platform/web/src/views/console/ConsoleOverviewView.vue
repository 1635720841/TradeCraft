<!--
  平台管理概览：租户规模、订阅分布与配额告警。
-->
<template>
  <div class="p-4 space-y-4">
    <el-card v-loading="loading" shadow="never">
      <template #header>
        <div class="flex items-center justify-between">
          <span class="font-medium">运营概览</span>
          <el-button link type="primary" @click="loadOverview">刷新</el-button>
        </div>
      </template>

      <template v-if="overview">
        <div class="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <el-statistic title="客户租户总数" :value="overview.totalTenants" />
          <el-statistic
            title="活跃订阅"
            :value="overview.byStatus.ACTIVE ?? 0"
          />
          <el-statistic
            title="试用中"
            :value="overview.byStatus.TRIAL ?? 0"
          />
          <el-statistic
            title="配额告警（≥80%）"
            :value="overview.highQuotaAlerts.length"
          />
        </div>

        <el-card v-if="billingRequests.length" shadow="never" class="mb-4 border border-blue-100">
          <template #header>
            <span class="font-medium text-blue-700">待审批续费/升级申请</span>
          </template>
          <el-table :data="billingRequests" stripe>
            <el-table-column prop="organizationName" label="企业" min-width="160" />
            <el-table-column prop="type" label="类型" width="100" />
            <el-table-column prop="message" label="说明" min-width="160">
              <template #default="{ row }">{{ row.message || "-" }}</template>
            </el-table-column>
            <el-table-column prop="createdAt" label="申请时间" min-width="170">
              <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="160" fixed="right">
              <template #default="{ row }">
                <el-button
                  link
                  type="primary"
                  :loading="actingRequestId === row.id"
                  @click="approveRequest(row.id)"
                >
                  通过
                </el-button>
                <el-button
                  link
                  type="danger"
                  :loading="actingRequestId === row.id"
                  @click="rejectRequest(row.id)"
                >
                  拒绝
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>

        <el-card v-if="overview.highQuotaAlerts.length" shadow="never" class="mb-4 border border-orange-100">
          <template #header>
            <span class="font-medium text-orange-700">配额告警租户</span>
          </template>
          <el-table :data="overview.highQuotaAlerts" stripe>
            <el-table-column prop="name" label="企业" min-width="160" />
            <el-table-column prop="usagePercent" label="使用率" width="100">
              <template #default="{ row }">{{ row.usagePercent }}%</template>
            </el-table-column>
            <el-table-column prop="remaining" label="剩余" width="90" align="right" />
            <el-table-column label="操作" width="100" fixed="right">
              <template #default="{ row }">
                <router-link
                  :to="`/console/tenants/${row.id}`"
                  class="text-primary text-sm"
                >
                  查看
                </router-link>
              </template>
            </el-table-column>
          </el-table>
        </el-card>

        <el-card shadow="never" class="border border-gray-100">
          <template #header>
            <span class="font-medium">最近租户</span>
          </template>
          <el-table :data="overview.recentTenants" stripe>
            <el-table-column prop="name" label="企业" min-width="160" />
            <el-table-column prop="planName" label="套餐" width="100">
              <template #default="{ row }">
                {{ dictLabel(planNameDict, row.planName) }}
              </template>
            </el-table-column>
            <el-table-column prop="subscriptionStatus" label="订阅" width="100">
              <template #default="{ row }">
                {{ dictLabel(subscriptionStatusDict, row.subscriptionStatus) }}
              </template>
            </el-table-column>
            <el-table-column label="操作" width="100" fixed="right">
              <template #default="{ row }">
                <router-link
                  :to="`/console/tenants/${row.id}`"
                  class="text-primary text-sm"
                >
                  详情
                </router-link>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </template>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import {
  approveConsoleBillingRequest,
  getConsoleOverview,
  listConsoleBillingRequests,
  rejectConsoleBillingRequest,
  type BillingChangeRequestItem,
  type ConsoleOverview
} from "@/api/console/index";
import { planNameDict, subscriptionStatusDict } from "@/constants/dicts/platform";
import { dictLabel } from "@/utils/dict";
import { message } from "@/utils/message";

defineOptions({ name: "ConsoleOverviewView" });

const loading = ref(false);
const overview = ref<ConsoleOverview | null>(null);
const billingRequests = ref<BillingChangeRequestItem[]>([]);
const actingRequestId = ref<string | null>(null);

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("zh-CN");
}

async function loadBillingRequests() {
  try {
    billingRequests.value = await listConsoleBillingRequests();
  } catch {
    billingRequests.value = [];
  }
}

async function approveRequest(requestId: string) {
  actingRequestId.value = requestId;
  try {
    await approveConsoleBillingRequest(requestId);
    message("已通过申请", { type: "success" });
    await Promise.all([loadOverview(), loadBillingRequests()]);
  } finally {
    actingRequestId.value = null;
  }
}

async function rejectRequest(requestId: string) {
  actingRequestId.value = requestId;
  try {
    await rejectConsoleBillingRequest(requestId);
    message("已拒绝申请", { type: "success" });
    await loadBillingRequests();
  } finally {
    actingRequestId.value = null;
  }
}

async function loadOverview() {
  loading.value = true;
  try {
    overview.value = await getConsoleOverview();
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void Promise.all([loadOverview(), loadBillingRequests()]);
});
</script>
