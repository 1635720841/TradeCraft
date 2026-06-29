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

      <el-collapse class="mt-4 max-w-2xl">
        <el-collapse-item title="更多创建方式（网站抓取）" name="batch">
          <el-form
            ref="batchFormRef"
            :model="batchForm"
            :rules="batchRules"
            label-width="100px"
            :class="{ 'pointer-events-none opacity-60': !canCreateJob }"
            @submit.prevent
          >
            <el-form-item label="目标网站" prop="siteId">
              <el-select
                v-model="batchForm.siteId"
                placeholder="选择站点"
                class="w-full"
                :loading="sitesLoading"
                @change="handleBatchSiteChange"
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
                {{ siteFieldDescription(selectedBatchSite) }}
              </p>
            </el-form-item>

            <el-form-item label="输出语言">
              <el-select v-model="batchForm.contentLanguage" class="w-full">
                <el-option
                  v-for="item in contentLanguageOptions"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
                />
              </el-select>
              <p class="mt-1 text-xs text-gray-500">默认跟随站点，可手动覆盖。</p>
            </el-form-item>

            <el-form-item label="来源">
              <el-radio-group v-model="batchForm.source">
                <el-radio value="site-crawl">从网站自动抓取</el-radio>
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

            <el-form-item v-else label="抓取预览">
              <div class="w-full">
                <el-button
                  size="small"
                  :loading="previewLoading"
                  :disabled="!batchForm.siteId"
                  @click="loadPreview"
                >
                  预览抓取结果
                </el-button>
                <div v-if="previewItems.length" class="mt-2 text-sm text-gray-600">
                  预览到 {{ previewItems.length }} 篇，将按「运行条数」截取
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

            <el-collapse class="mb-2">
              <el-collapse-item title="更多选项" name="advanced">
                <el-form-item label="仅博客页">
                  <el-switch v-model="batchForm.seoArticlesOnly" />
                  <p class="mt-1 text-xs text-gray-500">
                    开启后只抓取博客/资讯页；关闭会纳入更多页面。
                  </p>
                </el-form-item>
              </el-collapse-item>
            </el-collapse>

            <el-alert
              v-if="!quotaCanConsume(batchJobCount)"
              class="mb-4"
              type="error"
              :closable="false"
              show-icon
              :title="quotaPreview.previewText(batchJobCount)"
            >
              <template #default>
                <router-link to="/org/billing">查看用量与续期</router-link>
              </template>
            </el-alert>
            <p v-else class="text-sm text-gray-500 mb-3">
              {{ quotaPreview.previewText(batchJobCount) }}
            </p>

            <el-form-item>
              <el-button
                type="primary"
                :loading="submitting"
                :disabled="sites.length === 0 || !canCreateJob || !quotaCanConsume(batchJobCount)"
                @click="handleBatchSubmit"
              >
                批量提交
              </el-button>
            </el-form-item>
          </el-form>
        </el-collapse-item>
      </el-collapse>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { FormInstance, FormRules, InputInstance } from "element-plus";
import { ElMessageBox } from "element-plus";
import { createArticleJob, createBatchArticleJobs } from "@/api/seo-factory/article-job";
import {
  getSiteKeywordConflicts,
  type KeywordConflictItem,
  type KeywordConflictReason
} from "@/api/seo-factory/keyword-conflict";
import { listSiteSeoArticles, listSites } from "@/api/seo-factory/site";
import type { DiscoveredSeoArticle, SiteItem } from "@/api/seo-factory/types";
import {
  CONTENT_LANGUAGE_OPTIONS,
  keywordIntentByKeywordTypeDict,
  keywordIntentByPurposeDict,
  articleContentFormDict,
  type ContentLanguageCode
} from "@/constants/dicts/seo-factory";
import { message } from "@/utils/message";
import { useProjectSeoAccess } from "@/composables/seo-factory/useProjectSeoAccess";
import { useArticleQuotaPreview } from "@/composables/useArticleQuotaPreview";

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
const batchFormRef = ref<FormInstance>();
const keywordInputRef = ref<InputInstance>();

const contentLanguageOptions = CONTENT_LANGUAGE_OPTIONS;

const singleForm = reactive({
  siteId: "",
  targetKeyword: "",
  searchIntent: "COMMERCIAL",
  contentForm: "ARTICLE" as "ARTICLE" | "PRODUCT_ENHANCED" | "FAQ_PAGE",
  contentLanguage: "en" as ContentLanguageCode
});

const batchForm = reactive({
  siteId: "",
  source: "site-crawl" as "site-crawl" | "keywords",
  keywordsText: "",
  contentLanguage: "en" as ContentLanguageCode,
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

const sites = ref<SiteItem[]>([]);
const sitesLoading = ref(false);
const submitting = ref(false);
const previewLoading = ref(false);
const previewItems = ref<DiscoveredSeoArticle[]>([]);
const keywordConflicts = ref<KeywordConflictItem[]>([]);
let keywordConflictTimer: ReturnType<typeof setTimeout> | null = null;

const selectedSingleSite = computed(() =>
  sites.value.find((site) => site.id === singleForm.siteId)
);

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

function siteOptionSubline(site: SiteItem): string | undefined {
  const bits: string[] = [];
  if (site.contentLanguage === "zh-CN") bits.push("简体中文");
  else if (site.contentLanguage === "en") bits.push("英文");
  if (site.targetMarket) bits.push(site.targetMarket);
  return bits.length ? bits.join(" · ") : undefined;
}

function siteFieldDescription(site?: SiteItem): string {
  if (!site) return "将按该站配置写稿。";
  return siteOptionSubline(site) ? "将按该站语言与市场配置生成。" : "将按该站配置写稿。";
}

function lastSiteStorageKey() {
  return `seo-factory:last-site:${projectId}`;
}

function rememberLastSite(siteId: string) {
  if (!siteId) return;
  localStorage.setItem(lastSiteStorageKey(), siteId);
}

function resolveLastSiteId(): string | null {
  const saved = localStorage.getItem(lastSiteStorageKey());
  if (!saved) return null;
  return sites.value.some((site) => site.id === saved) ? saved : null;
}

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

async function loadSites() {
  sitesLoading.value = true;
  try {
    sites.value = await listSites(projectId);
    const lastSiteId = resolveLastSiteId();
    if (lastSiteId) {
      const site = sites.value.find((item) => item.id === lastSiteId);
      if (site) applySiteDefaults(site);
    } else if (sites.value.length === 1) {
      applySiteDefaults(sites.value[0]);
    }
  } finally {
    sitesLoading.value = false;
  }
}

function applySiteDefaults(site: SiteItem) {
  singleForm.siteId = site.id;
  batchForm.siteId = site.id;
  const language = (site.contentLanguage === "zh-CN" ? "zh-CN" : "en") as ContentLanguageCode;
  singleForm.contentLanguage = language;
  batchForm.contentLanguage = language;
}

function handleBatchSiteChange() {
  previewItems.value = [];
  const site = sites.value.find((item) => item.id === batchForm.siteId);
  if (site) {
    batchForm.contentLanguage = (
      site.contentLanguage === "zh-CN" ? "zh-CN" : "en"
    ) as ContentLanguageCode;
  }
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
      contentLanguage: singleForm.contentLanguage
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
  const valid = await batchFormRef.value?.validate().catch(() => false);
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
      contentLanguage: batchForm.contentLanguage
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
    const site = sites.value.find((s) => s.id === siteId);
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
  await loadSites();
  applyRoutePrefill();
  void quotaPreview.refreshQuota();
});
</script>
