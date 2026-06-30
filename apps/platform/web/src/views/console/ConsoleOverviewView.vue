<!--
  平台管理概览：待办驱动（续费审批 + 配额告警）。
-->
<template>
  <div class="p-4 space-y-4">
    <el-card v-loading="loading" shadow="never">
      <template #header>
        <div class="flex items-center justify-between">
          <span class="font-medium">运营概览</span>
          <el-button link type="primary" @click="loadAll">刷新</el-button>
        </div>
      </template>

      <template v-if="overview">
        <div>
          <div class="mb-2 font-medium">今日待办</div>
          <el-empty
            v-if="!loading && todoItems.length === 0"
            description="暂无待处理事项"
            :image-size="72"
          />
          <el-table v-else :data="todoItems" stripe>
            <el-table-column label="类型" width="110">
              <template #default="{ row }">
                <el-tag size="small" :type="row.tagType">{{ row.typeLabel }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="organizationName" label="企业" min-width="160" />
            <el-table-column label="说明" min-width="180">
              <template #default="{ row }">{{ row.summary }}</template>
            </el-table-column>
            <el-table-column label="时间" width="170">
              <template #default="{ row }">
                {{ row.time ? formatTime(row.time) : "—" }}
              </template>
            </el-table-column>
            <el-table-column v-if="canManageTenant" label="操作" width="180" fixed="right">
              <template #default="{ row }">
                <template v-if="row.kind === 'billing'">
                  <el-button
                    link
                    type="primary"
                    :loading="actingRequestId === row.requestId"
                    @click="approveRequest(row.requestId!)"
                  >
                    通过
                  </el-button>
                  <el-button
                    link
                    type="danger"
                    :loading="actingRequestId === row.requestId"
                    @click="rejectRequest(row.requestId!)"
                  >
                    拒绝
                  </el-button>
                </template>
                <router-link
                  v-else
                  :to="`/console/tenants/${row.organizationId}`"
                  class="text-primary text-sm"
                >
                  去处理
                </router-link>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </template>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  approveConsoleBillingRequest,
  getConsoleOverview,
  listConsoleBillingRequests,
  rejectConsoleBillingRequest,
  type BillingChangeRequestItem,
  type ConsoleOverview
} from "@/api/console/index";
import { billingChangeRequestTypeDict } from "@/constants/dicts/platform";
import { hasPerms } from "@/utils/auth";
import { dictLabel, dictTagType } from "@/utils/dict";
import { message } from "@/utils/message";

defineOptions({ name: "ConsoleOverviewView" });

interface TodoItem {
  kind: "billing" | "quota";
  typeLabel: string;
  tagType: "primary" | "success" | "warning" | "danger" | "info";
  organizationId: string;
  organizationName: string;
  summary: string;
  time: string | null;
  requestId?: string;
}

const loading = ref(false);
const overview = ref<ConsoleOverview | null>(null);
const billingRequests = ref<BillingChangeRequestItem[]>([]);
const actingRequestId = ref<string | null>(null);
const canManageTenant = computed(() => hasPerms("console:tenant:update"));

const todoItems = computed<TodoItem[]>(() => {
  const billingTodos: TodoItem[] = billingRequests.value.map((row) => ({
    kind: "billing" as const,
    typeLabel: dictLabel(billingChangeRequestTypeDict, row.type) || row.type,
    tagType: (dictTagType(billingChangeRequestTypeDict, row.type) ?? "primary") as TodoItem["tagType"],
    organizationId: row.organizationId,
    organizationName: row.organizationName,
    summary: row.message || "—",
    time: row.createdAt,
    requestId: row.id
  }));

  const quotaTodos: TodoItem[] = (overview.value?.highQuotaAlerts ?? []).map((row) => ({
    kind: "quota" as const,
    typeLabel: "配额告警",
    tagType: "warning" as const,
    organizationId: row.id,
    organizationName: row.name,
    summary: `使用率 ${row.usagePercent}%，剩余 ${row.remaining}/${row.periodQuota} 篇`,
    time: null
  }));

  return [...billingTodos, ...quotaTodos];
});

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("zh-CN");
}

async function loadBillingRequests() {
  if (!canManageTenant.value) {
    billingRequests.value = [];
    return;
  }
  try {
    billingRequests.value = await listConsoleBillingRequests();
  } catch (error) {
    billingRequests.value = [];
    message((error as Error).message ?? "加载待办失败", { type: "error" });
  }
}

async function approveRequest(requestId: string) {
  actingRequestId.value = requestId;
  try {
    await approveConsoleBillingRequest(requestId);
    message("已通过申请", { type: "success" });
    await loadAll();
  } finally {
    actingRequestId.value = null;
  }
}

async function rejectRequest(requestId: string) {
  actingRequestId.value = requestId;
  try {
    await rejectConsoleBillingRequest(requestId);
    message("已拒绝申请", { type: "success" });
    await loadAll();
  } finally {
    actingRequestId.value = null;
  }
}

async function loadOverview() {
  loading.value = true;
  try {
    overview.value = await getConsoleOverview();
  } catch (error) {
    overview.value = null;
    message((error as Error).message ?? "加载概览失败", { type: "error" });
  } finally {
    loading.value = false;
  }
}

async function loadAll() {
  await Promise.all([loadOverview(), loadBillingRequests()]);
}

onMounted(() => {
  void loadAll();
});
</script>
