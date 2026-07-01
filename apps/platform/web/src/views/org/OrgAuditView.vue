<!--
  企业操作审计（租户内，只读）。
-->
<template>
  <div class="p-4">
    <AuditLogTable scope="org" />
  </div>
</template>

<script setup lang="ts">
import AuditLogTable from "@/components/audit/AuditLogTable.vue";

defineOptions({ name: "OrgAuditView" });
</script>
