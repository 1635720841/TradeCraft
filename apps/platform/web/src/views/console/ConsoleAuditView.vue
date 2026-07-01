<!--
  操作审计页：全平台操作日志查询（超管默认看全部企业与账号）。
-->
<template>
  <AdminPageShell
    title="操作审计"
    description="默认展示全平台操作记录；可按企业与操作人筛选。"
  >
    <template #alert>
      默认展示全平台操作记录（含各企业管理员与成员）；可按企业或操作人账号筛选。
    </template>
    <AuditLogTable scope="console" />
  </AdminPageShell>
</template>

<script setup lang="ts">
import AdminPageShell from "@/components/layout/AdminPageShell.vue";
import AuditLogTable from "@/components/audit/AuditLogTable.vue";

defineOptions({ name: "ConsoleAuditView" });
</script>
