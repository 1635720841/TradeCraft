<!--
  创建文章任务页：单条关键词或批量采集 SEO 文章后入队。

  边界：
  - 不负责：同步等待生成结果（跳转详情页轮询）
-->
<template>
  <div class="p-4">
    <el-card shadow="never" class="max-w-2xl">
      <template #header>
        <span class="font-medium">新建文章任务</span>
      </template>

      <el-tabs v-model="activeTab">
        <el-tab-pane label="单条关键词" name="single">
          <el-form
            ref="singleFormRef"
            :model="singleForm"
            :rules="singleRules"
            label-width="120px"
            class="mt-2"
            @submit.prevent
          >
            <!-- <el-form-item label="目标站点" prop="siteId">
              <el-select
                v-model="singleForm.siteId"
                placeholder="请选择站点"
                class="w-full"
                :loading="sitesLoading"
              >
                <el-option
                  v-for="site in sites"
                  :key="site.id"
                  :label="site.domain"
                  :value="site.id"
                />
              </el-select>
            </el-form-item> -->

            <el-form-item label="目标关键词" prop="targetKeyword">
              <el-input
                v-model="singleForm.targetKeyword"
                placeholder="例如：industrial valve supplier"
                maxlength="200"
                show-word-limit
              />
            </el-form-item>

            <el-form-item label="SERP 竞品条数">
              <el-input-number v-model="singleForm.serpArticleLimit" :min="1" :max="10" />
            </el-form-item>

            <el-form-item label="仅 SEO 文章">
              <el-switch v-model="singleForm.serpArticlesOnly" />
            </el-form-item>

            <el-form-item>
              <el-button type="primary" :loading="submitting" @click="handleSingleSubmit">
                提交任务
              </el-button>
              <el-button @click="goBack">返回列表</el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <el-tab-pane label="批量采集" name="batch">
          <el-form
            ref="batchFormRef"
            :model="batchForm"
            :rules="batchRules"
            label-width="120px"
            class="mt-2"
            @submit.prevent
          >
            <!-- <el-form-item label="目标站点" prop="siteId">
              <el-select
                v-model="batchForm.siteId"
                placeholder="请选择站点"
                class="w-full"
                :loading="sitesLoading"
                @change="handleBatchSiteChange"
              >
                <el-option
                  v-for="site in sites"
                  :key="site.id"
                  :label="site.domain"
                  :value="site.id"
                />
              </el-select>
            </el-form-item> -->

            <el-form-item label="来源">
              <el-radio-group v-model="batchForm.source">
                <el-radio value="site-crawl">站点 sitemap 采集</el-radio>
                <el-radio value="keywords">手动输入列表</el-radio>
              </el-radio-group>
            </el-form-item>

            <el-form-item v-if="batchForm.source === 'keywords'" label="关键词/URL" prop="keywordsText">
              <el-input
                v-model="batchForm.keywordsText"
                type="textarea"
                :rows="6"
                placeholder="每行一条关键词或文章 URL"
              />
            </el-form-item>

            <el-form-item v-else label="采集预览">
              <div class="w-full">
                <el-button
                  size="small"
                  :loading="previewLoading"
                  :disabled="!batchForm.siteId"
                  @click="loadPreview"
                >
                  预览采集结果
                </el-button>
                <div v-if="previewItems.length" class="mt-2 text-sm text-gray-600">
                  预览到 {{ previewItems.length }} 条 SEO 文章（将按下方「运行条数」截取）
                </div>
                <el-table
                  v-if="previewItems.length"
                  :data="previewItems.slice(0, 8)"
                  size="small"
                  class="mt-2"
                  max-height="220"
                >
                  <el-table-column prop="keyword" label="关键词" min-width="160" />
                  <el-table-column prop="url" label="URL" min-width="220" show-overflow-tooltip />
                </el-table>
              </div>
            </el-form-item>

            <el-form-item label="运行条数">
              <el-input-number v-model="batchForm.limit" :min="1" :max="20" />
            </el-form-item>

            <el-form-item label="仅 SEO 文章">
              <el-switch v-model="batchForm.seoArticlesOnly" />
            </el-form-item>

            <el-form-item label="SERP 竞品条数">
              <el-input-number v-model="batchForm.serpArticleLimit" :min="1" :max="10" />
            </el-form-item>

            <el-form-item>
              <el-button type="primary" :loading="submitting" @click="handleBatchSubmit">
                批量提交
              </el-button>
              <el-button @click="goBack">返回列表</el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>
      </el-tabs>

      <el-alert
        v-if="sites.length === 0 && !sitesLoading"
        type="warning"
        :closable="false"
        show-icon
        class="mt-2"
      >
        <template #title>
          当前项目暂无站点。请在项目根目录执行
          <code class="mx-1">pnpm db:seed</code>
          后刷新；或使用菜单「平台 → SEO 文章任务」进入开发环境。
        </template>
      </el-alert>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { FormInstance, FormRules } from "element-plus";
import { createArticleJob, createBatchArticleJobs } from "@/api/seo-factory/article-job";
import { listSiteSeoArticles, listSites } from "@/api/seo-factory/site";
import type { DiscoveredSeoArticle, SiteItem } from "@/api/seo-factory/types";
import { message } from "@/utils/message";

defineOptions({ name: "JobCreateView" });

const route = useRoute();
const router = useRouter();
const projectId = route.params.projectId as string;

const activeTab = ref<"single" | "batch">("single");
const singleFormRef = ref<FormInstance>();
const batchFormRef = ref<FormInstance>();

const singleForm = reactive({
  siteId: "",
  targetKeyword: "",
  serpArticleLimit: 5,
  serpArticlesOnly: true
});

const batchForm = reactive({
  siteId: "",
  source: "site-crawl" as "site-crawl" | "keywords",
  keywordsText: "",
  limit: 5,
  seoArticlesOnly: true,
  serpArticleLimit: 5
});

const singleRules: FormRules = {
  siteId: [{ required: true, message: "请选择站点", trigger: "change" }],
  targetKeyword: [
    { required: true, message: "请输入目标关键词", trigger: "blur" },
    { min: 2, message: "关键词至少 2 个字符", trigger: "blur" }
  ]
};

const batchRules: FormRules = {
  siteId: [{ required: true, message: "请选择站点", trigger: "change" }],
  keywordsText: [
    {
      validator: (_rule, value, callback) => {
        if (batchForm.source !== "keywords") {
          callback();
          return;
        }
        const lines = String(value ?? "")
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);
        if (lines.length === 0) {
          callback(new Error("请至少输入一行关键词或 URL"));
          return;
        }
        callback();
      },
      trigger: "blur"
    }
  ]
};

const sites = ref<SiteItem[]>([]);
const sitesLoading = ref(false);
const submitting = ref(false);
const previewLoading = ref(false);
const previewItems = ref<DiscoveredSeoArticle[]>([]);

watch(
  () => batchForm.siteId,
  () => {
    previewItems.value = [];
  }
);

async function loadSites() {
  sitesLoading.value = true;
  try {
    sites.value = await listSites(projectId);
    if (sites.value.length === 1) {
      singleForm.siteId = sites.value[0].id;
      batchForm.siteId = sites.value[0].id;
    }
  } finally {
    sitesLoading.value = false;
  }
}

function handleBatchSiteChange() {
  previewItems.value = [];
}

async function loadPreview() {
  if (!batchForm.siteId) return;
  previewLoading.value = true;
  try {
    previewItems.value = await listSiteSeoArticles(
      projectId,
      batchForm.siteId,
      batchForm.limit * 3,
      batchForm.seoArticlesOnly
    );
    if (previewItems.value.length === 0) {
      message("未采集到 SEO 文章，请检查站点 sitemap", { type: "warning" });
    }
  } finally {
    previewLoading.value = false;
  }
}

async function handleSingleSubmit() {
  const valid = await singleFormRef.value?.validate().catch(() => false);
  if (!valid) return;

  submitting.value = true;
  try {
    const job = await createArticleJob(projectId, {
      siteId: singleForm.siteId,
      targetKeyword: singleForm.targetKeyword.trim(),
      serpArticleLimit: singleForm.serpArticleLimit,
      serpArticlesOnly: singleForm.serpArticlesOnly
    });
    message("任务已提交，正在排队处理", { type: "success" });
    router.push({
      name: "SeoFactoryJobDetail",
      params: { projectId, jobId: job.id }
    });
  } finally {
    submitting.value = false;
  }
}

async function handleBatchSubmit() {
  const valid = await batchFormRef.value?.validate().catch(() => false);
  if (!valid) return;

  submitting.value = true;
  try {
    const keywords =
      batchForm.source === "keywords"
        ? batchForm.keywordsText
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
        : undefined;

    const result = await createBatchArticleJobs(projectId, {
      siteId: batchForm.siteId,
      source: batchForm.source,
      keywords,
      limit: batchForm.limit,
      seoArticlesOnly: batchForm.seoArticlesOnly,
      serpArticleLimit: batchForm.serpArticleLimit,
      serpArticlesOnly: true
    });

    message(`已提交 ${result.created} 条任务`, { type: "success" });
    router.push({ name: "SeoFactoryJobs", params: { projectId } });
  } finally {
    submitting.value = false;
  }
}

function goBack() {
  router.push({ name: "SeoFactoryJobs", params: { projectId } });
}

onMounted(() => {
  void loadSites();
});
</script>
