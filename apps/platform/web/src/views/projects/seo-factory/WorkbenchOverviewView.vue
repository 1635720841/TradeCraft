<!--
  SEO 工厂项目概览：任务统计与快捷入口。

  边界：
  - 不负责：任务详情（JobDetailView）
-->
<template>
  <div class="p-4 space-y-4">
    <el-row :gutter="16">
      <el-col :xs="12" :sm="8" :md="4">
        <el-card shadow="never">
          <el-statistic title="任务总数" :value="stats?.totalJobs ?? 0" />
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="8" :md="4">
        <el-card shadow="never">
          <el-statistic title="进行中" :value="stats?.activeJobs ?? 0" />
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="8" :md="4">
        <el-card shadow="never">
          <el-statistic title="已完成" :value="stats?.completedJobs ?? 0" />
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="8" :md="4">
        <el-card shadow="never">
          <el-statistic title="失败" :value="stats?.failedJobs ?? 0" />
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="8" :md="4">
        <el-card shadow="never">
          <el-statistic title="待 YMYL 审核" :value="stats?.pendingReviewCount ?? 0" />
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="8" :md="4">
        <el-card shadow="never">
          <el-statistic title="站点数" :value="stats?.siteCount ?? 0" />
        </el-card>
      </el-col>
    </el-row>

    <el-card v-loading="loading" shadow="never">
      <template #header>
        <span class="font-medium">快速开始</span>
      </template>

      <div v-if="stats?.siteCount === 0" class="space-y-3">
        <el-alert
          type="warning"
          :closable="false"
          show-icon
          title="尚未配置站点"
          description="创建站点并填写域名、目标市场与品牌语气后，即可提交文章生成任务。"
        />
        <el-button type="primary" @click="goSites">去创建站点</el-button>
      </div>

      <div v-else class="flex flex-wrap gap-2">
        <el-button type="primary" @click="goCreate">新建文章任务</el-button>
        <el-button @click="goJobs">查看任务列表</el-button>
        <el-button @click="goSites">管理站点</el-button>
        <el-button @click="goKeywords">关键词池</el-button>
        <el-button v-if="(stats?.pendingReviewCount ?? 0) > 0" type="warning" @click="goReviews">
          处理待审核（{{ stats?.pendingReviewCount }}）
        </el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { getSeoFactoryProjectStats } from "@/api/seo-factory/article-job";
import type { SeoFactoryProjectStats } from "@/api/seo-factory/types";

defineOptions({ name: "WorkbenchOverviewView" });

const route = useRoute();
const router = useRouter();
const projectId = route.params.projectId as string;

const loading = ref(false);
const stats = ref<SeoFactoryProjectStats | null>(null);

async function loadStats() {
  loading.value = true;
  try {
    stats.value = await getSeoFactoryProjectStats(projectId);
  } finally {
    loading.value = false;
  }
}

function goCreate() {
  router.push({ name: "SeoFactoryJobCreate", params: { projectId } });
}

function goJobs() {
  router.push({ name: "SeoFactoryJobs", params: { projectId } });
}

function goSites() {
  router.push({ name: "SeoFactorySites", params: { projectId } });
}

function goReviews() {
  router.push({ name: "SeoFactoryReviews", params: { projectId } });
}

function goKeywords() {
  router.push({ name: "SeoFactoryKeywords", params: { projectId } });
}

onMounted(() => {
  void loadStats();
});
</script>
