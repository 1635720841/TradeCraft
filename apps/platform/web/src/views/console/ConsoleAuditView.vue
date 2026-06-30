<!--
  操作审计页：全平台操作日志查询（超管默认看全部企业与账号）。
-->
<template>
  <div class="p-4">
    <el-alert
      type="info"
      :closable="false"
      show-icon
      class="mb-4"
      title="默认展示全平台操作记录（含各企业管理员与成员）；可按企业或操作人账号筛选。"
    />

    <el-card v-loading="loading" shadow="never">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="font-medium">操作审计</span>
          <div class="flex flex-wrap gap-2">
            <el-select
              v-model="filters.organizationId"
              placeholder="全部企业"
              clearable
              filterable
              class="w-48"
            >
              <el-option
                v-for="tenant in tenantOptions"
                :key="tenant.id"
                :label="tenant.name"
                :value="tenant.id"
              />
            </el-select>
            <el-input
              v-model="filters.actorKeyword"
              placeholder="操作人邮箱/姓名"
              clearable
              class="w-52"
              @keyup.enter="search"
            />
            <el-select
              v-model="filters.action"
              placeholder="操作类型"
              clearable
              class="w-44"
            >
              <el-option
                v-for="action in auditActionOptions"
                :key="action.value"
                :label="action.label"
                :value="action.value"
              />
            </el-select>
            <el-date-picker
              v-model="dateRange"
              type="datetimerange"
              range-separator="至"
              start-placeholder="开始时间"
              end-placeholder="结束时间"
              value-format="YYYY-MM-DDTHH:mm:ss.SSSZ"
              class="w-80"
            />
            <el-button type="primary" @click="search">查询</el-button>
            <el-button @click="resetFilters">重置</el-button>
          </div>
        </div>
      </template>

      <el-table :data="items" stripe>
        <el-table-column prop="createdAt" label="时间" min-width="170">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" min-width="140">
          <template #default="{ row }">
            {{ actionLabel(row.action) }}
            <div class="text-xs mw-text-muted">{{ row.action }}</div>
          </template>
        </el-table-column>
        <el-table-column label="操作人" min-width="200">
          <template #default="{ row }">
            <div>{{ row.actorEmail || row.actorUserId }}</div>
            <div v-if="row.actorName || row.actorRole" class="text-xs mw-text-muted">
              <span v-if="row.actorName">{{ row.actorName }}</span>
              <span v-if="row.actorRole">
                {{ row.actorName ? " · " : "" }}{{ dictLabel(memberRoleDict, row.actorRole) }}
              </span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="所属企业" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.organizationName || (row.organizationId ? "平台操作" : "-") }}
          </template>
        </el-table-column>
        <el-table-column prop="targetType" label="目标类型" width="110">
          <template #default="{ row }">{{ row.targetType || "-" }}</template>
        </el-table-column>
        <el-table-column type="expand" width="48">
          <template #default="{ row }">
            <div class="p-3 text-sm mw-text-body">
              <div v-if="row.organizationId">企业 ID: {{ row.organizationId }}</div>
              <div v-if="row.traceId">Trace: {{ row.traceId }}</div>
              <div v-if="row.targetId">目标 ID: {{ row.targetId }}</div>
              <pre
                v-if="row.metadata"
                class="mt-2 overflow-auto rounded bg-gray-50 p-2 text-xs"
              >{{ JSON.stringify(row.metadata, null, 2) }}</pre>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <div class="mt-4 flex justify-end">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="limit"
          :total="total"
          :page-sizes="[20, 50, 100]"
          layout="total, sizes, prev, pager, next"
          @current-change="fetchLogs"
          @size-change="onSizeChange"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { useRoute } from "vue-router";
import {
  listAuditLogs,
  listTenants,
  type AuditLogItem,
  type TenantItem
} from "@/api/console/index";
import { auditActionDict, memberRoleDict } from "@/constants/dicts/platform";
import { dictLabel, dictOptions } from "@/utils/dict";

defineOptions({ name: "ConsoleAuditView" });

const route = useRoute();

const loading = ref(false);
const items = ref<AuditLogItem[]>([]);
const page = ref(1);
const limit = ref(50);
const total = ref(0);
const dateRange = ref<[string, string] | null>(null);
const auditActionOptions = dictOptions(auditActionDict);
const tenantOptions = ref<TenantItem[]>([]);
const filters = reactive({
  organizationId: "",
  actorKeyword: "",
  action: ""
});

function actionLabel(action: string) {
  return dictLabel(auditActionDict, action) || action;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("zh-CN");
}

async function loadTenantOptions() {
  const result = await listTenants(1, 100);
  tenantOptions.value = result.items;
}

async function fetchLogs() {
  loading.value = true;
  try {
    const result = await listAuditLogs(page.value, limit.value, {
      organizationId: filters.organizationId || undefined,
      actorKeyword: filters.actorKeyword.trim() || undefined,
      action: filters.action || undefined,
      dateFrom: dateRange.value?.[0],
      dateTo: dateRange.value?.[1]
    });
    items.value = result.items;
    total.value = result.pagination.total;
    page.value = result.pagination.page;
    limit.value = result.pagination.limit;
  } finally {
    loading.value = false;
  }
}

function search() {
  page.value = 1;
  void fetchLogs();
}

function resetFilters() {
  filters.organizationId = "";
  filters.actorKeyword = "";
  filters.action = "";
  dateRange.value = null;
  page.value = 1;
  void fetchLogs();
}

function onSizeChange() {
  page.value = 1;
  void fetchLogs();
}

onMounted(() => {
  const orgFromQuery = route.query.organizationId;
  if (typeof orgFromQuery === "string" && orgFromQuery) {
    filters.organizationId = orgFromQuery;
  }
  void loadTenantOptions();
  void fetchLogs();
});
</script>
