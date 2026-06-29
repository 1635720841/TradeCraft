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
            <div class="text-xs text-gray-400">{{ row.action }}</div>
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
import { http } from "@/utils/http";
import type { WmApiResponse } from "@/api/platform/types";

defineOptions({ name: "OrgAuditView" });

const ACTION_LABELS: Record<string, string> = {
  "auth.login": "用户登录",
  "org.member.invite": "邀请成员",
  "org.member.create": "添加成员",
  "org.member.update": "编辑成员",
  "org.member.grant": "成员权限授予",
  "org.profile.update": "企业资料更新",
  "project.create": "创建项目",
  "project.update": "更新项目",
  "project.archive": "归档项目",
  "project.delete": "删除项目",
  "project.member.add": "添加项目成员",
  "project.member.update": "编辑项目成员",
  "project.member.remove": "移除项目成员",
  "project.member.grant": "项目成员授权",
  "project.access_request.approve": "批准项目访问申请",
  "project.access_request.reject": "拒绝项目访问申请",
  "article_job.cms_publish": "CMS 发布",
  "article_job.brief_approve": "Brief 确认",
  "content_review.approve": "内容审核通过",
  "content_review.reject": "内容审核驳回",
  "org.member.disable": "禁用成员",
  "org.member.enable": "启用成员"
};

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
  return ACTION_LABELS[action] ?? action;
}

async function load() {
  loading.value = true;
  try {
    const res = await http.request<WmApiResponse<AuditRow[]>>(
      "get",
      "/api/v1/org/audit-logs",
      { params: { limit: 50 } }
    );
    rows.value = res.data ?? [];
  } finally {
    loading.value = false;
  }
}

onMounted(() => void load());
</script>
