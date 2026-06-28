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
import { getConsoleOverview, type ConsoleOverview } from "@/api/console/index";
import { planNameDict, subscriptionStatusDict } from "@/constants/dicts/platform";
import { dictLabel } from "@/utils/dict";

defineOptions({ name: "ConsoleOverviewView" });

const loading = ref(false);
const overview = ref<ConsoleOverview | null>(null);

async function loadOverview() {
  loading.value = true;
  try {
    overview.value = await getConsoleOverview();
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void loadOverview();
});
</script>
