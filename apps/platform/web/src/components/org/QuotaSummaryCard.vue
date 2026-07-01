<!--
  企业配额摘要卡片：展示账期配额使用与剩余。
-->
<template>
  <el-card shadow="never" class="border border-gray-100">
    <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
      <span class="text-sm font-medium text-gray-700">配额使用</span>
      <slot name="action" />
    </div>
    <el-progress
      :percentage="percent"
      :status="progressStatus"
      :stroke-width="12"
    >
      <span class="text-sm">
        已占用 {{ quota.reservedTotal }} / {{ quota.periodQuota || quota.monthlyQuota }} 篇
      </span>
    </el-progress>
    <p v-if="quota.remaining != null" class="mt-2 text-sm text-gray-500">
      剩余 {{ quota.remaining }} 篇
      <template v-if="quota.daysRemaining != null && quota.subscriptionActive">
        · 账期剩余 {{ quota.daysRemaining }} 天
      </template>
    </p>
  </el-card>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { OrganizationProfile } from "@/api/org/organization";

defineOptions({ name: "QuotaSummaryCard" });

const props = defineProps<{
  quota: OrganizationProfile["quota"];
}>();

const percent = computed(() => {
  const total = props.quota.periodQuota || props.quota.monthlyQuota;
  if (!total) return 0;
  return Math.min(100, Math.round((props.quota.reservedTotal / total) * 100));
});

const progressStatus = computed(() => {
  if (percent.value >= 90) return "exception";
  if (percent.value >= 70) return "warning";
  return "success";
});
</script>
