<!--
  企业操作审计（租户内，只读）。
-->
<template>
  <div class="p-4">
    <el-card v-loading="loading" shadow="never">
      <template #header>
        <span class="font-medium">操作审计</span>
      </template>
      <el-table :data="rows" stripe>
        <el-table-column prop="createdAt" label="时间" width="180">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column prop="action" label="操作" min-width="160">
          <template #default="{ row }">
            {{ actionLabel(row.action) }}
            <div class="text-xs mw-text-muted">{{ row.action }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="actorEmail" label="操作人" min-width="180" />
        <el-table-column prop="targetType" label="对象类型" width="120" />
        <el-table-column prop="targetId" label="对象 ID" min-width="120" show-overflow-tooltip />
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { auditActionDict } from "@/constants/dicts/platform";
import { dictLabel, dictTagType } from "@/utils/dict";
import { listOrgAuditLogs } from "@/api/org/audit";

defineOptions({ name: "OrgAuditView" });

interface AuditRow {
  id: string;
  action: string;
  actorEmail: string | null;
  targetType: string | null;
  targetId: string | null;
  createdAt: string;
}

const loading = ref(false);
const rows = ref<AuditRow[]>([]);

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("zh-CN");
}

function actionLabel(action: string) {
  return dictLabel(auditActionDict, action) || action;
}

async function load() {
  loading.value = true;
  try {
    rows.value = await listOrgAuditLogs({ limit: 50 });
  } finally {
    loading.value = false;
  }
}

onMounted(() => void load());
</script>
