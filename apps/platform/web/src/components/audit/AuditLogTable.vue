<!--
  操作审计表格（Org / Console 共用）。
-->
<template>
  <el-card v-loading="logsLoading" shadow="never">
    <el-alert
      v-if="logsError"
      type="error"
      :title="logsError"
      show-icon
      class="mb-4"
    >
      <template #default>
        <el-button type="primary" link @click="retryLogs">重试</el-button>
      </template>
    </el-alert>
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="font-medium">操作审计</span>
        <div class="flex flex-wrap gap-2">
          <el-select
            v-if="scope === 'console'"
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

    <el-empty v-if="!logsLoading && items.length === 0" description="暂无审计记录" />

    <el-table v-else :data="items" stripe>
      <el-table-column prop="createdAt" label="时间" min-width="170">
        <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" min-width="140">
        <template #default="{ row }">
          <el-tooltip :content="row.action" placement="top">
            <span>{{ actionLabel(row.action) }}</span>
          </el-tooltip>
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
      <el-table-column
        v-if="scope === 'console'"
        label="所属企业"
        min-width="160"
        show-overflow-tooltip
      >
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

    <div v-if="total > 0" class="mt-4 flex justify-end">
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
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { listOrgAuditLogs } from "@/api/org/audit";
import { listAuditLogs, listTenants, type AuditLogItem, type TenantItem } from "@/api/console/index";
import { auditActionDict, memberRoleDict } from "@/constants/dicts/platform";
import { dictLabel, dictOptions } from "@/utils/dict";
import { useAsyncData } from "@/composables/useAsyncData";

const props = defineProps<{
  scope: "org" | "console";
}>();

const route = useRoute();

const page = ref(1);
const limit = ref(50);
const dateRange = ref<[string, string] | null>(null);
const auditActionOptions = dictOptions(auditActionDict);
const tenantOptions = ref<TenantItem[]>([]);
const filters = reactive({
  organizationId: "",
  actorKeyword: "",
  action: ""
});

interface AuditLogsResult {
  items: AuditLogItem[];
  pagination: { total: number; page: number; limit: number };
}

const {
  data: logsData,
  loading: logsLoading,
  error: logsError,
  load: fetchLogs,
  retry: retryLogs
} = useAsyncData(async (): Promise<AuditLogsResult> => {
  const query = {
    page: page.value,
    limit: limit.value,
    action: filters.action || undefined,
    actorKeyword: filters.actorKeyword.trim() || undefined,
    dateFrom: dateRange.value?.[0],
    dateTo: dateRange.value?.[1],
    ...(props.scope === "console"
      ? { organizationId: filters.organizationId || undefined }
      : {})
  };

  if (props.scope === "console") {
    const result = await listAuditLogs(page.value, limit.value, query);
    return {
      items: result.items,
      pagination: result.pagination
    };
  }

  const result = await listOrgAuditLogs(query);
  return {
    items: result.items,
    pagination: result.pagination
  };
});

const items = computed(() => logsData.value?.items ?? []);
const total = computed(() => logsData.value?.pagination.total ?? 0);

watch(logsData, (result) => {
  if (!result) return;
  page.value = result.pagination.page;
  limit.value = result.pagination.limit;
});

function actionLabel(action: string) {
  return dictLabel(auditActionDict, action) || action;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("zh-CN");
}

async function loadTenantOptions() {
  if (props.scope !== "console") return;
  const result = await listTenants(1, 100);
  tenantOptions.value = result.items;
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

watch(
  () => props.scope,
  () => {
    page.value = 1;
    void fetchLogs();
  }
);

watch(
  () => route.query.organizationId,
  (orgId) => {
    if (props.scope !== "console") return;
    filters.organizationId = typeof orgId === "string" ? orgId : "";
    page.value = 1;
    void fetchLogs();
  }
);

onMounted(() => {
  if (props.scope === "console") {
    const orgFromQuery = route.query.organizationId;
    if (typeof orgFromQuery === "string" && orgFromQuery) {
      filters.organizationId = orgFromQuery;
    }
    void loadTenantOptions();
  }
  void fetchLogs();
});
</script>
