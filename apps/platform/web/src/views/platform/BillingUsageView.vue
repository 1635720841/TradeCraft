<!--
  计费用量页：展示企业 CreditUsage 记录。

  边界：
  - 不负责：扣费策略配置（后端 BillingService）
-->
<template>
  <div class="p-4">
    <el-card shadow="never">
      <template #header>
        <div class="flex items-center justify-between">
          <span class="font-medium">用量统计</span>
          <el-button type="primary" link @click="fetchUsage">刷新</el-button>
        </div>
      </template>

      <el-alert
        class="mb-4"
        type="info"
        :closable="false"
        show-icon
        title="文章任务完成（COMPLETED）后自动记入用量；当前按篇计费占位，费用字段待后续套餐接入。"
      />

      <div class="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <el-statistic title="记录总数" :value="total" />
        <el-statistic title="本页文章完成" :value="pageArticleCount" />
        <el-statistic
          title="本页预估费用"
          :value="pageEstimatedCost"
          :precision="2"
          prefix="$"
        />
      </div>

      <el-table v-loading="loading" :data="items" stripe style="width: 100%">
        <el-table-column prop="createdAt" label="时间" min-width="170">
          <template #default="{ row }">
            {{ formatTime(row.createdAt) }}
          </template>
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
          <template #default="{ row }">
            {{ formatCost(row.estimatedCost) }}
          </template>
        </el-table-column>
        <el-table-column prop="projectType" label="项目类型" width="120">
          <template #default="{ row }">
            {{ row.projectType || "-" }}
          </template>
        </el-table-column>
        <el-table-column prop="projectId" label="项目 ID" min-width="200" show-overflow-tooltip />
        <el-table-column prop="traceId" label="Trace ID" min-width="200" show-overflow-tooltip />
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

      <el-empty v-if="!loading && items.length === 0" description="暂无用量记录" />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  listBillingUsage,
  type CreditUsageItem
} from "@/api/platform/billing";
import { billingServiceTypeDict } from "@/constants/dicts/billing";
import { dictLabel, dictTagType } from "@/utils/dict";

defineOptions({ name: "BillingUsageView" });

const loading = ref(false);
const items = ref<CreditUsageItem[]>([]);
const page = ref(1);
const limit = ref(20);
const total = ref(0);

const pageArticleCount = computed(
  () => items.value.filter(row => row.serviceType === "ARTICLE").length
);

const pageEstimatedCost = computed(() =>
  items.value.reduce((sum, row) => sum + (row.estimatedCost ?? 0), 0)
);

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("zh-CN");
}

function formatCost(value: number) {
  return `$${Number(value ?? 0).toFixed(2)}`;
}

async function fetchUsage() {
  loading.value = true;
  try {
    const result = await listBillingUsage(page.value, limit.value);
    items.value = result.items;
    total.value = result.pagination.total;
    page.value = result.pagination.page;
    limit.value = result.pagination.limit;
  } finally {
    loading.value = false;
  }
}

function onSizeChange() {
  page.value = 1;
  void fetchUsage();
}

onMounted(() => {
  void fetchUsage();
});
</script>
