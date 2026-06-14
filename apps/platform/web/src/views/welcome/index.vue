<script setup lang="ts">
import { useRouter } from "vue-router";

defineOptions({
  name: "Welcome"
});

const router = useRouter();

function goProjects() {
  router.push({ name: "PlatformProjects" });
}
</script>

<template>
  <div class="p-6">
    <el-card shadow="never" class="max-w-3xl">
      <template #header>
        <span class="text-lg font-medium">欢迎使用 SEO SaaS 企业平台</span>
      </template>

      <p class="text-gray-600 leading-7">
        本平台帮助团队批量生产 SEO 文章：从 SERP 研究、Brief 生成、初稿撰写，到内链植入、配图、Semrush 优化与 HTML 导出。
      </p>

      <el-steps class="my-6" :active="4" align-center>
        <el-step title="创建项目" description="选择 seo-factory 类型" />
        <el-step title="配置站点" description="域名、市场、品牌语气" />
        <el-step title="提交任务" description="关键词或批量采集" />
        <el-step title="审核导出" description="YMYL 通过后下载 HTML" />
      </el-steps>

      <div class="flex flex-wrap gap-2">
        <el-button type="primary" @click="goProjects">进入项目列表</el-button>
      </div>
    </el-card>
  </div>
</template>
