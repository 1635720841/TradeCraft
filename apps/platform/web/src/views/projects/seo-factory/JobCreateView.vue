<!--
  创建文章任务页：单条关键词或批量采集 SEO 文章后入队。

  边界：
  - 不负责：同步等待生成结果（跳转详情页轮询）
-->
<template>
  <div class="p-4">
    <el-card shadow="never" class="max-w-2xl">
      <template #header>
        <div>
          <span class="font-medium">新建文章任务</span>
          <p class="mt-1 text-sm text-gray-500 font-normal">
            提交后自动排队生成，可在任务列表查看进度。
          </p>
        </div>
      </template>

      <el-alert
        v-if="!canCreateJob"
        type="warning"
        :closable="false"
        show-icon
        title="您没有创建任务的权限，请联系项目管理员授权"
        class="mb-4"
      />

      <el-alert
        v-if="!sitesLoading && sites.length === 0"
        class="mb-4"
        type="warning"
        :closable="false"
        show-icon
        title="请先创建站点"
        description="创建任务前需先添加站点。"
      >
        <template #default>
          <el-button type="primary" size="small" class="mt-2" @click="goSites">
            去站点管理
          </el-button>
        </template>
      </el-alert>

      <el-form
        ref="singleFormRef"
        :model="singleForm"
        :rules="singleRules"
        label-width="100px"
        :class="{ 'pointer-events-none opacity-60': !canCreateJob }"
        @submit.prevent
      >
            <el-form-item label="目标网站" prop="siteId">
              <el-select
                v-model="singleForm.siteId"
                placeholder="选择站点"
                class="w-full"
                :loading="sitesLoading"
              >
                <el-option
                  v-for="site in sites"
                  :key="site.id"
                  :label="site.domain"
                  :value="site.id"
                >
                  <div class="py-0.5">
                    <div>{{ site.domain }}</div>
                    <div v-if="siteOptionSubline(site)" class="text-xs text-gray-400 leading-tight">
                      {{ siteOptionSubline(site) }}
                    </div>
                  </div>
                </el-option>
              </el-select>
              <p class="mt-1 text-xs text-gray-500">
                {{ siteFieldDescription(selectedSingleSite) }}
              </p>
            </el-form-item>

            <el-form-item label="目标关键词" prop="targetKeyword">
              <el-input
                ref="keywordInputRef"
                v-model="singleForm.targetKeyword"
                placeholder="例如：industrial valve supplier"
                maxlength="200"
                show-word-limit
              />
              <p class="mt-1 text-xs text-gray-500">用户在 Google 会搜的词。</p>
            </el-form-item>

            <el-form-item v-if="singleSerpPicker.showPicker" label="本篇优化市场">
              <el-select v-model="singleForm.serpCountry" class="w-full">
                <el-option
                  v-for="item in singleSerpPicker.options"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
                />
              </el-select>
              <p class="mt-1 text-xs text-gray-500">
                本篇按所选国家的 Google 搜索结果分析竞品并生成大纲。
                <template v-if="singleSerpPicker.siteMarketsLabel">
                  站点面向：{{ singleSerpPicker.siteMarketsLabel }}。
                </template>
              </p>
            </el-form-item>

            <el-form-item label="搜索意图">
              <el-select v-model="singleForm.searchIntent" class="w-full" placeholder="请选择">
                <el-option-group label="按读者目的">
                  <el-option
                    v-for="item in keywordIntentByPurposeDict"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                  >
                    <div class="py-0.5">
                      <div>{{ item.label }}</div>
                      <div v-if="item.description" class="text-xs text-gray-400 leading-tight">
                        {{ item.description }}
                      </div>
                    </div>
                  </el-option>
                </el-option-group>
                <el-option-group label="按词类型（仅品牌/竞品词）">
                  <el-option
                    v-for="item in keywordIntentByKeywordTypeDict"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                  >
                    <div class="py-0.5">
                      <div>{{ item.label }}</div>
                      <div v-if="item.description" class="text-xs text-gray-400 leading-tight">
                        {{ item.description }}
                      </div>
                    </div>
                  </el-option>
                </el-option-group>
              </el-select>
              <p class="mt-1 text-xs text-gray-500">
                大多数产品词选「对比选购」；仅当关键词本身是品牌名时才选下方两类。
              </p>
            </el-form-item>

            <el-form-item label="内容形态">
              <el-select v-model="singleForm.contentForm" class="w-full" placeholder="请选择">
                <el-option
                  v-for="item in articleContentFormDict"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
                >
                  <div class="py-0.5">
                    <div>{{ item.label }}</div>
                    <div v-if="item.description" class="text-xs text-gray-400 leading-tight">
                      {{ item.description }}
                    </div>
                  </div>
                </el-option>
              </el-select>
            </el-form-item>

            <el-form-item label="输出语言" prop="contentLanguage">
              <el-select v-model="singleForm.contentLanguage" class="w-full">
                <el-option
                  v-for="item in contentLanguageOptions"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
                />
              </el-select>
              <p class="mt-1 text-xs text-gray-500">默认跟随站点，可手动覆盖。</p>
            </el-form-item>

            <el-alert
              v-if="keywordConflicts.length"
              class="mb-4"
              type="warning"
              :closable="false"
              show-icon
              title="检测到相似关键词任务"
            >
              <template #default>
                <ul class="list-disc pl-5 text-sm">
                  <li v-for="item in keywordConflicts" :key="item.jobId">
                    「{{ item.keyword }}」（{{ conflictReasonLabel(item.reason) }}）
                  </li>
                </ul>
              </template>
            </el-alert>

            <el-alert
              v-if="!quotaCanConsume(1)"
              class="mb-4"
              type="error"
              :closable="false"
              show-icon
              :title="quotaPreview.previewText(1)"
            >
              <template #default>
                <router-link to="/org/billing">查看用量与续期</router-link>
              </template>
            </el-alert>
            <p v-else class="text-sm text-gray-500 mb-3">{{ quotaPreview.previewText(1) }}</p>

            <el-form-item>
              <el-button
                type="primary"
                :loading="submitting"
                :disabled="sites.length === 0 || !canCreateJob || !quotaCanConsume(1)"
                @click="handleSingleSubmit"
              >
                提交任务
              </el-button>
              <el-button @click="goBack">返回列表</el-button>
            </el-form-item>
      </el-form>

      <JobCreateBatchSection
        ref="batchSectionRef"
        :sites="sites"
        :sites-loading="sitesLoading"
        :can-create-job="canCreateJob"
        :batch-form="batchForm"
        :batch-rules="batchRules"
        :batch-serp-picker="batchSerpPicker"
        :selected-batch-site="selectedBatchSite"
        :preview-loading="previewLoading"
        :preview-items="previewItems"
        :submitting="submitting"
        :quota-can-consume="quotaCanConsume(batchJobCount)"
        :quota-preview-text="quotaPreview.previewText(batchJobCount)"
        :site-option-subline="siteOptionSubline"
        :site-field-description="siteFieldDescription"
        @batch-site-change="handleBatchSiteChange"
        @load-preview="loadPreview"
        @submit="handleBatchSubmit"
      />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { FormInstance, FormRules, InputInstance } from "element-plus";
import { ElMessageBox } from "element-plus";
import { createArticleJob, createBatchArticleJobs } from "@/api/seo-factory/article-job";
import {
  getSiteKeywordConflicts,
  type KeywordConflictItem,
  type KeywordConflictReason
} from "@/api/seo-factory/keyword-conflict";
import { listSiteSeoArticles } from "@/api/seo-factory/site";
import type { DiscoveredSeoArticle, SiteItem } from "@/api/seo-factory/types";
import {
  CONTENT_LANGUAGE_OPTIONS,
  keywordIntentByKeywordTypeDict,
  keywordIntentByPurposeDict,
  articleContentFormDict,
  type ContentLanguageCode,
  type SerpCountryCode
} from "@/constants/dicts/seo-factory";
import { message } from "@/utils/message";
import { resolveJobSerpCountryPicker } from "@/utils/seo-factory/target-market";
import { useProjectSeoAccess } from "@/composables/seo-factory/useProjectSeoAccess";
import { useJobCreateSitePicker } from "@/composables/seo-factory/useJobCreateSitePicker";
import { useArticleQuotaPreview } from "@/composables/useArticleQuotaPreview";
import JobCreateBatchSection from "./components/JobCreateBatchSection.vue";

defineOptions({ name: "JobCreateView" });

const route = useRoute();
const router = useRouter();
const projectId = route.params.projectId as string;
const { can } = useProjectSeoAccess();
const quotaPreview = useArticleQuotaPreview();
const canCreateJob = computed(() => can("seo:job:create"));

function quotaCanConsume(count: number) {
  return quotaPreview.canConsume(count);
}

const singleFormRef = ref<FormInstance>();
const batchSectionRef = ref<InstanceType<typeof JobCreateBatchSection>>();
const keywordInputRef = ref<InputInstance>();

const {
  sites,
  sitesLoading,
  loadSites,
  rememberLastSite,
  resolveLastSiteId,
  findSite,
  siteOptionSubline,
  siteFieldDescription
} = useJobCreateSitePicker(projectId);

const contentLanguageOptions = CONTENT_LANGUAGE_OPTIONS;

const singleForm = reactive({
  siteId: "",
  targetKeyword: "",
  searchIntent: "COMMERCIAL",
  contentForm: "ARTICLE" as "ARTICLE" | "PRODUCT_ENHANCED" | "FAQ_PAGE",
  contentLanguage: "en" as ContentLanguageCode,
  serpCountry: "US" as SerpCountryCode
});

const batchForm = reactive({
  siteId: "",
  source: "site-crawl" as "site-crawl" | "keywords",
  keywordsText: "",
  contentLanguage: "en" as ContentLanguageCode,
  serpCountry: "US" as SerpCountryCode,
  limit: 5,
  seoArticlesOnly: true
});

const singleRules: FormRules = {
  siteId: [{ required: true, message: "请选择目标网站", trigger: "change" }],
  targetKeyword: [
    { required: true, message: "请输入目标关键词", trigger: "blur" },
    { min: 2, message: "关键词至少 2 个字符", trigger: "blur" }
  ]
};

const batchRules: FormRules = {
  siteId: [{ required: true, message: "请选择目标网站", trigger: "change" }],
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

const submitting = ref(false);
const previewLoading = ref(false);
const previewItems = ref<DiscoveredSeoArticle[]>([]);
const keywordConflicts = ref<KeywordConflictItem[]>([]);
let keywordConflictTimer: ReturnType<typeof setTimeout> | null = null;

const selectedSingleSite = computed(() =>
  sites.value.find((site) => site.id === singleForm.siteId)
);

const singleSerpPicker = computed(() => resolveJobSerpCountryPicker(selectedSingleSite.value));

const batchJobCount = computed(() => {
  if (batchForm.source === "keywords") {
    return batchForm.keywordsText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean).length;
  }
  return batchForm.limit;
});
const selectedBatchSite = computed(() =>
  sites.value.find((site) => site.id === batchForm.siteId)
);

const batchSerpPicker = computed(() => resolveJobSerpCountryPicker(selectedBatchSite.value));

watch(
  () => batchForm.siteId,
  () => {
    previewItems.value = [];
  }
);

watch(
  () => [singleForm.siteId, singleForm.targetKeyword] as const,
  ([siteId, keyword]) => {
    if (keywordConflictTimer) clearTimeout(keywordConflictTimer);
    keywordConflicts.value = [];
    if (!siteId || keyword.trim().length < 2) return;
    keywordConflictTimer = setTimeout(() => {
      void loadKeywordConflicts(siteId, keyword.trim());
    }, 400);
  }
);

async function loadKeywordConflicts(siteId: string, keyword: string) {
  try {
    keywordConflicts.value = await getSiteKeywordConflicts(projectId, siteId, keyword);
  } catch {
    keywordConflicts.value = [];
  }
}

function conflictReasonLabel(reason: KeywordConflictReason) {
  if (reason === "exact") return "完全相同";
  if (reason === "substring") return "包含关系";
  return "高度相似";
}

async function confirmKeywordConflictsIfNeeded(): Promise<boolean> {
  if (keywordConflicts.value.length === 0) return true;
  try {
    await ElMessageBox.confirm(
      `该站点已有 ${keywordConflicts.value.length} 个相似任务，可能产出重复内容。仍要创建吗？`,
      "相似关键词提示",
      { type: "warning", confirmButtonText: "仍要创建", cancelButtonText: "取消" }
    );
    return true;
  } catch {
    return false;
  }
}

async function initSites() {
  await loadSites();
  const lastSiteId = resolveLastSiteId();
  if (lastSiteId) {
    const site = findSite(lastSiteId);
    if (site) applySiteDefaults(site);
  } else if (sites.value.length === 1) {
    applySiteDefaults(sites.value[0]);
  }
}

function applySiteDefaults(site: SiteItem) {
  singleForm.siteId = site.id;
  batchForm.siteId = site.id;
  const language = (site.contentLanguage === "zh-CN" ? "zh-CN" : "en") as ContentLanguageCode;
  singleForm.contentLanguage = language;
  batchForm.contentLanguage = language;
  syncSerpCountryForSite(site);
}

function syncSerpCountryForSite(site: SiteItem) {
  const picker = resolveJobSerpCountryPicker(site);
  singleForm.serpCountry = picker.defaultCountry;
  batchForm.serpCountry = picker.defaultCountry;
}

function handleBatchSiteChange() {
  previewItems.value = [];
  const site = findSite(batchForm.siteId);
  if (site) {
    batchForm.contentLanguage = (
      site.contentLanguage === "zh-CN" ? "zh-CN" : "en"
    ) as ContentLanguageCode;
    syncSerpCountryForSite(site);
  }
}

watch(
  () => singleForm.siteId,
  (siteId) => {
    const site = findSite(siteId);
    if (site) syncSerpCountryForSite(site);
  }
);

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
      message("未抓取到文章，请检查站点是否已配置 sitemap", { type: "warning" });
    }
  } finally {
    previewLoading.value = false;
  }
}

async function handleSingleSubmit() {
  const valid = await singleFormRef.value?.validate().catch(() => false);
  if (!valid) return;
  if (!(await confirmKeywordConflictsIfNeeded())) return;
  if (!quotaCanConsume(1)) {
    message("本账期配额不足", { type: "warning" });
    return;
  }

  submitting.value = true;
  try {
    const job = await createArticleJob(projectId, {
      siteId: singleForm.siteId,
      targetKeyword: singleForm.targetKeyword.trim(),
      searchIntent: singleForm.searchIntent,
      contentForm: singleForm.contentForm,
      contentLanguage: singleForm.contentLanguage,
      ...(singleSerpPicker.value.showPicker ? { serpCountry: singleForm.serpCountry } : {})
    });
    rememberLastSite(singleForm.siteId);
    message("任务已提交，正在排队处理", { type: "success" });
    if (job.warnings?.length) {
      message(job.warnings[0].message, { type: "warning" });
    }
    router.push({
      name: "SeoFactoryJobDetail",
      params: { projectId, jobId: job.id }
    });
  } finally {
    submitting.value = false;
  }
}

async function handleBatchSubmit() {
  const valid = await batchSectionRef.value?.batchFormRef?.validate().catch(() => false);
  if (!valid) return;
  if (!quotaCanConsume(batchJobCount.value)) {
    message("本账期配额不足", { type: "warning" });
    return;
  }

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
      contentLanguage: batchForm.contentLanguage,
      ...(batchSerpPicker.value.showPicker ? { serpCountry: batchForm.serpCountry } : {})
    });

    rememberLastSite(batchForm.siteId);

    message(`已提交 ${result.created} 条任务`, { type: "success" });
    router.push({ name: "SeoFactoryJobs", params: { projectId } });
  } finally {
    submitting.value = false;
  }
}

function goBack() {
  router.push({ name: "SeoFactoryJobs", params: { projectId } });
}

function applyRoutePrefill() {
  const siteId = route.query.siteId;
  const keyword = route.query.keyword;
  if (typeof siteId === "string" && sites.value.some((s) => s.id === siteId)) {
    singleForm.siteId = siteId;
    const site = findSite(siteId);
    if (site) applySiteDefaults(site);
  }
  if (typeof keyword === "string" && keyword.trim()) {
    singleForm.targetKeyword = keyword.trim();
    void nextTick(() => keywordInputRef.value?.focus());
  }
}

function goSites() {
  router.push({ name: "SeoFactorySites", params: { projectId } });
}

onMounted(async () => {
  await initSites();
  applyRoutePrefill();
  void quotaPreview.refreshQuota();
});

onUnmounted(() => {
  if (keywordConflictTimer) {
    clearTimeout(keywordConflictTimer);
    keywordConflictTimer = null;
  }
});
</script>
