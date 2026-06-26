<!--
  项目设置：发布集成、页面库、流程开关与搜索表现。

  边界：
  - 不负责：运营向站点卖点编辑（SiteManageView）
-->
<template>
  <div class="p-4 space-y-4">
    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="设置说明"
      description="此处配置 CMS 发布、大纲确认流程、搜索结果竞品策略、页面库同步与 Google 搜索表现。日常运营填写公司卖点请在「站点」中完成。"
    />

    <el-card shadow="never">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="font-medium">流程与发布集成</span>
          <div class="flex flex-wrap gap-2">
            <el-select
              v-model="selectedSiteId"
              placeholder="选择站点"
              style="width: 220px"
              :loading="sitesLoading"
              @change="onSiteChange"
            >
              <el-option
                v-for="site in sites"
                :key="site.id"
                :label="site.domain"
                :value="site.id"
              />
            </el-select>
            <el-button type="primary" :loading="saving" :disabled="!selectedSiteId" @click="submitAdminForm">
              保存配置
            </el-button>
          </div>
        </div>
      </template>

      <el-empty v-if="!sitesLoading && sites.length === 0" description="请先在「站点」创建站点" />

      <el-form v-else :model="adminForm" label-width="120px">
        <el-form-item label="大纲需确认">
          <el-switch v-model="adminForm.requireBriefApproval" />
          <p class="mt-1 text-xs text-gray-500">
            开启后，大纲生成完成需人工确认再进入初稿，适合 B2B 方向把控。
          </p>
        </el-form-item>

        <el-form-item label="原创表达优化">
          <el-switch v-model="adminForm.enableParaphrase" />
          <p class="mt-1 text-xs text-gray-500">
            Semrush 优化后自动去 AI 套话、轻量润色。术语敏感站点可关闭。
          </p>
        </el-form-item>

        <el-form-item label="自动配图">
          <el-switch v-model="adminForm.enableIllustration" />
          <p class="mt-1 text-xs text-gray-500">
            内链完成后通过 BFL 自动生成文章配图。关闭后正文不含插图，可节省配图配额。
          </p>
        </el-form-item>

        <el-collapse class="mb-2">
          <el-collapse-item title="评分门槛与重试（管理端）" name="score-thresholds">
            <el-form-item label="本地通过分">
              <el-input-number v-model="adminForm.localPassThreshold" :min="70" :max="100" :step="1" controls-position="right" />
              <p class="mt-1 text-xs text-gray-500">本地预检进门闸，默认 95。达标后才进入 Semrush 终检。</p>
            </el-form-item>
            <el-form-item label="Semrush 通过分">
              <el-input-number v-model="adminForm.semrushPassThreshold" :min="7" :max="10" :step="0.1" :precision="1" controls-position="right" />
              <p class="mt-1 text-xs text-gray-500">Semrush 终检权威分，默认 9.0。任务是否通过以此为准。</p>
            </el-form-item>
            <el-form-item label="本地优化轮次">
              <el-input-number v-model="adminForm.localMaxOptimizeRounds" :min="1" :max="15" :step="1" controls-position="right" />
              <p class="mt-1 text-xs text-gray-500">未达本地通过分时，AI 改写最多几轮，默认 5。</p>
            </el-form-item>
            <el-form-item label="本地重试追加">
              <el-input-number v-model="adminForm.localRetryExtraRounds" :min="0" :max="10" :step="1" controls-position="right" />
              <p class="mt-1 text-xs text-gray-500">任务失败重跑时，在已用满常规轮次后再追加几轮，默认 3。</p>
            </el-form-item>
            <el-form-item label="Semrush 优化轮次">
              <el-input-number v-model="adminForm.semrushMaxOptimizeRounds" :min="1" :max="15" :step="1" controls-position="right" />
              <p class="mt-1 text-xs text-gray-500">Semrush 未达标时按侧栏建议改写，默认 5 轮。</p>
            </el-form-item>
            <el-form-item label="Semrush 重试追加">
              <el-input-number v-model="adminForm.semrushRetryExtraRounds" :min="0" :max="10" :step="1" controls-position="right" />
              <p class="mt-1 text-xs text-gray-500">Semrush 阶段失败重跑时再追加几轮，默认 4。</p>
            </el-form-item>
          </el-collapse-item>
          <el-collapse-item title="评分校准（管理端）" name="score-calibration">
            <el-form-item label="影子日志">
              <el-switch v-model="adminForm.scoreCalibrationShadow" />
              <p class="mt-1 text-xs text-gray-500">
                M6 优化时记录「校准预测分 vs Semrush 真分」，供实验室分析。默认开启。
              </p>
            </el-form-item>
            <el-form-item label="降频 RPA">
              <el-switch v-model="adminForm.scoreCalibrationReduceRpa" />
              <p class="mt-1 text-xs text-gray-500">
                高置信度时优化轮跳过 Semrush RPA；流程结束仍会做一次确认 RPA。需验证 MAE ≤0.35、验证样本 ≥15、训练样本 ≥30。
              </p>
              <el-alert
                v-if="showReduceRpaIneffectiveWarning"
                class="mt-2"
                type="warning"
                :closable="false"
                show-icon
                title="已开启但未生效"
                :description="reduceRpaIneffectiveHint"
              />
            </el-form-item>
            <el-form-item label="本地对齐 Sem">
              <el-switch v-model="adminForm.scoreCalibrationLocalAlign" />
              <p class="mt-1 text-xs text-gray-500">
                本地优化进门闸改用「校准预测 Semrush 分」，与 Semrush 通过线同一标准；需实验室 production_ready。
              </p>
              <el-alert
                v-if="showLocalAlignIneffectiveWarning"
                class="mt-2"
                type="warning"
                :closable="false"
                show-icon
                title="已开启但未生效"
                :description="localAlignIneffectiveHint"
              />
            </el-form-item>
          </el-collapse-item>
        </el-collapse>

        <el-divider content-position="left">搜索结果 / 竞品分析</el-divider>

        <el-form-item label="参考竞品篇数">
          <el-input-number v-model="adminForm.serpArticleLimit" :min="1" :max="20" />
          <p class="mt-1 text-xs text-gray-500">
            生成大纲时最多参考几篇竞品，默认 5。产品型搜索词可酌情调高。
          </p>
        </el-form-item>

        <el-form-item label="只分析标准文章">
          <el-switch v-model="adminForm.serpArticlesOnly" />
          <p class="mt-1 text-xs text-gray-500">
            开启后仅保留博客、指南和资讯文章；论坛、问答、社区、产品页和公司页不会参与样本分析。
          </p>
        </el-form-item>

        <el-form-item label="搜索国家">
          <el-select v-model="adminForm.serpCountry" class="w-full">
            <el-option
              v-for="item in serpCountryOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
          <p class="mt-1 text-xs text-gray-500">
            用于 Google 搜索地区参数（Serper `gl`），默认美国（US）。
          </p>
        </el-form-item>

        <el-collapse class="mb-2">
          <el-collapse-item title="竞品分析高级参数" name="serp-advanced">
            <el-form-item label="Google 抓取条数">
              <el-input-number v-model="adminForm.serpOrganicFetchNum" :min="10" :max="50" :step="5" />
              <p class="mt-1 text-xs text-gray-500">
                过滤前从 Google 拉多少条结果，默认 30。博客很少时可调到 40～50。
              </p>
            </el-form-item>

            <el-form-item label="搜索缓存">
              <el-select v-model="adminForm.serpCacheTtlHours" class="w-full">
                <el-option
                  v-for="item in serpCacheTtlOptions"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
                />
              </el-select>
              <p class="mt-1 text-xs text-gray-500">
                相同搜索词在缓存有效期内不会重复调用 Google API。设为「不缓存」则每次都实时拉取。
              </p>
            </el-form-item>

            <el-form-item label=" ">
              <el-button
                :loading="clearingSerpCache"
                :disabled="!selectedSiteId"
                @click="handleClearSerpCache"
              >
                清除本项目搜索缓存
              </el-button>
              <p class="mt-1 text-xs text-gray-500">
                立即删除本项目已缓存的 Google 搜索结果，下次分析会重新拉取。
              </p>
            </el-form-item>
          </el-collapse-item>
        </el-collapse>

        <template v-if="cmsUiEnabled">
          <el-divider content-position="left">CMS 发布</el-divider>
          <el-form-item label="CMS 类型">
            <el-select v-model="adminForm.cmsType" class="w-full" clearable placeholder="不启用">
              <el-option label="WordPress" value="wordpress" />
              <el-option label="Shopify" value="shopify" />
            </el-select>
          </el-form-item>

          <template v-if="adminForm.cmsType === 'wordpress'">
            <el-form-item label="站点 URL">
              <el-input v-model="adminForm.wpBaseUrl" placeholder="https://example.com" />
            </el-form-item>
            <el-form-item label="用户名">
              <el-input v-model="adminForm.wpUsername" placeholder="WordPress 用户名" />
            </el-form-item>
            <el-form-item label="应用密码">
              <el-input
                v-model="adminForm.wpAppPassword"
                type="password"
                show-password
                :placeholder="adminForm.wpPasswordConfigured ? '留空则保留原密码' : 'WordPress Application Password'"
              />
            </el-form-item>
            <el-form-item label="默认状态">
              <el-select v-model="adminForm.wpDefaultStatus" class="w-full">
                <el-option label="草稿（推荐）" value="draft" />
                <el-option label="直接发布" value="publish" />
              </el-select>
            </el-form-item>
          </template>

          <template v-else-if="adminForm.cmsType === 'shopify'">
            <el-form-item label="店铺域名">
              <el-input v-model="adminForm.shopDomain" placeholder="your-store.myshopify.com" />
            </el-form-item>
            <el-form-item label="Admin Token">
              <el-input
                v-model="adminForm.shopAccessToken"
                type="password"
                show-password
                :placeholder="adminForm.shopTokenConfigured ? '留空则保留原 Token' : 'shpat_...'"
              />
            </el-form-item>
            <el-form-item label="推送目的地">
              <el-radio-group v-model="adminForm.shopPublishTarget">
                <el-radio value="blog">Blog 文章</el-radio>
                <el-radio value="product">产品详情页</el-radio>
              </el-radio-group>
            </el-form-item>
            <el-form-item v-if="adminForm.shopPublishTarget === 'blog'" label="Blog">
              <div class="flex w-full gap-2">
                <el-select
                  v-model="adminForm.shopBlogId"
                  placeholder="请先加载 Blog 列表"
                  class="flex-1"
                  filterable
                  clearable
                >
                  <el-option
                    v-for="blog in shopifyBlogs"
                    :key="blog.id"
                    :label="`${blog.title} (${blog.handle})`"
                    :value="blog.id"
                  />
                </el-select>
                <el-button :loading="shopifyBlogsLoading" @click="loadShopifyBlogs">加载</el-button>
              </div>
            </el-form-item>
            <el-form-item v-else label="Product">
              <div class="flex w-full gap-2">
                <el-select
                  v-model="adminForm.shopProductId"
                  placeholder="请先加载 Product 列表"
                  class="flex-1"
                  filterable
                  clearable
                >
                  <el-option
                    v-for="product in shopifyProducts"
                    :key="product.id"
                    :label="`${product.title} (${product.status})`"
                    :value="product.id"
                  />
                </el-select>
                <el-button :loading="shopifyProductsLoading" @click="loadShopifyProducts">加载</el-button>
              </div>
            </el-form-item>
            <el-form-item label="默认发布">
              <el-switch
                v-model="adminForm.shopDefaultPublished"
                active-text="直接发布"
                inactive-text="草稿"
              />
            </el-form-item>
          </template>
        </template>
      </el-form>
    </el-card>

    <SitePageLibraryPanel
      v-if="selectedSiteId"
      :project-id="projectId"
      :site-id="selectedSiteId"
      :site-domain="selectedSite?.domain"
    />

    <el-card shadow="never" class="mb-4">
      <template #header>
        <span class="font-medium">内容评分</span>
      </template>
      <p class="mb-3 text-sm text-gray-500">
        独立试算页：粘贴关键词与正文，秒级得到 0–10 分与优化建议（不创建任务、不跑 Semrush RPA）。改稿页侧栏使用同一套算法。
      </p>
      <el-button type="primary" @click="goContentScore">打开内容评分</el-button>
    </el-card>

    <el-card shadow="never" class="settings-score-lab">
      <template #header>
        <span class="font-medium">评分校准实验室</span>
      </template>
      <p class="mb-3 text-sm text-gray-500">
        对比本地预检与 Semrush 真分，训练校准模型并导出训练集。用于降低 RPA 调用频率，终检仍以 Semrush 为准。
      </p>
      <el-button type="primary" plain @click="goScoreLab">打开实验室</el-button>
    </el-card>

    <div id="gsc" class="settings-gsc">
      <GscPerformanceView embedded />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  getScoreCalibrationReadiness,
  type ScoreCalibrationReadiness
} from "@/api/seo-factory/score-calibration";
import {
  clearSiteSerpCache,
  listShopifyBlogs,
  listShopifyProducts,
  listSites,
  updateSite
} from "@/api/seo-factory/site";
import type { ShopifyBlogItem, ShopifyProductItem, SiteItem } from "@/api/seo-factory/types";
import { isShopifyCmsConfig, isWordPressCmsConfig } from "@/api/seo-factory/types";
import { WORDPRESS_CMS_UI_ENABLED } from "@/constants/feature-flags";
import {
  LOCAL_SEO_MAX_OPTIMIZE_ROUNDS,
  LOCAL_SEO_PASS_THRESHOLD,
  LOCAL_SEO_RETRY_EXTRA_ROUNDS,
  SEMRUSH_MAX_OPTIMIZE_ROUNDS,
  SEMRUSH_PASS_THRESHOLD,
  SEMRUSH_RETRY_EXTRA_ROUNDS
} from "@/constants/seo-factory";
import { scoreCalibrationReadinessDict } from "@/constants/dicts/score-calibration";
import { dictLabel } from "@/utils/dict";
import { message } from "@/utils/message";
import GscPerformanceView from "./GscPerformanceView.vue";
import SitePageLibraryPanel from "./components/SitePageLibraryPanel.vue";

defineOptions({ name: "ProjectSettingsView" });

const cmsUiEnabled = WORDPRESS_CMS_UI_ENABLED;

const route = useRoute();
const router = useRouter();
const projectId = route.params.projectId as string;

const sitesLoading = ref(false);
const saving = ref(false);
const clearingSerpCache = ref(false);
const shopifyBlogsLoading = ref(false);
const shopifyProductsLoading = ref(false);
const sites = ref<SiteItem[]>([]);
const shopifyBlogs = ref<ShopifyBlogItem[]>([]);
const shopifyProducts = ref<ShopifyProductItem[]>([]);
const calibrationReadiness = ref<ScoreCalibrationReadiness | null>(null);

const showReduceRpaIneffectiveWarning = computed(
  () => adminForm.scoreCalibrationReduceRpa && calibrationReadiness.value?.reduceRpaEffective === false
);

const showLocalAlignIneffectiveWarning = computed(
  () =>
    adminForm.scoreCalibrationLocalAlign &&
    calibrationReadiness.value?.state !== "production_ready"
);

const reduceRpaIneffectiveHint = computed(() => {
  const r = calibrationReadiness.value;
  if (!r) return "正在加载就绪状态…";
  const stateLabel = dictLabel(scoreCalibrationReadinessDict, r.state);
  const parts: string[] = [`当前：${stateLabel}`];
  if (r.gaps.samplesNeeded > 0) parts.push(`还需 ${r.gaps.samplesNeeded} 条训练样本`);
  if (r.gaps.jobsNeeded > 0) parts.push(`还需 ${r.gaps.jobsNeeded} 个任务`);
  if (r.gaps.holdoutSamplesNeeded > 0) parts.push(`验证样本还需 ${r.gaps.holdoutSamplesNeeded} 条`);
  if (r.holdoutMae !== null) parts.push(`验证 MAE ${r.holdoutMae}（生产门槛 ≤0.35）`);
  parts.push("优化轮仍会调用 Semrush RPA。");
  return parts.join("；");
});

const localAlignIneffectiveHint = computed(() => {
  const r = calibrationReadiness.value;
  if (!r) return "正在加载就绪状态…";
  const stateLabel = dictLabel(scoreCalibrationReadinessDict, r.state);
  const parts: string[] = [`当前：${stateLabel}`];
  if (r.gaps.samplesNeeded > 0) parts.push(`还需 ${r.gaps.samplesNeeded} 条训练样本`);
  if (r.gaps.holdoutSamplesNeeded > 0) parts.push(`验证样本还需 ${r.gaps.holdoutSamplesNeeded} 条`);
  if (r.holdoutMae !== null) parts.push(`验证 MAE ${r.holdoutMae}（生产门槛 ≤0.35）`);
  parts.push("未就绪时仍用本地 0–100 规则分进门闸。");
  return parts.join("；");
});
const selectedSiteId = ref("");

const serpCacheTtlOptions = [
  { value: 0, label: "不缓存（每次都实时拉取）" },
  { value: 6, label: "6 小时" },
  { value: 12, label: "12 小时" },
  { value: 24, label: "24 小时（推荐）" },
  { value: 48, label: "48 小时" },
  { value: 168, label: "7 天" }
];

const serpCountryOptions = [
  { value: "US", label: "美国 (US)" },
  { value: "GB", label: "英国 (GB)" },
  { value: "CA", label: "加拿大 (CA)" },
  { value: "AU", label: "澳大利亚 (AU)" },
  { value: "SG", label: "新加坡 (SG)" },
  { value: "IN", label: "印度 (IN)" },
  { value: "DE", label: "德国 (DE)" },
  { value: "FR", label: "法国 (FR)" },
  { value: "JP", label: "日本 (JP)" },
  { value: "KR", label: "韩国 (KR)" },
  { value: "VN", label: "越南 (VN)" }
] as const;

const adminForm = reactive({
  requireBriefApproval: false,
  enableParaphrase: true,
  enableIllustration: true,
  scoreCalibrationShadow: true,
  scoreCalibrationReduceRpa: false,
  scoreCalibrationLocalAlign: false,
  localPassThreshold: LOCAL_SEO_PASS_THRESHOLD,
  semrushPassThreshold: SEMRUSH_PASS_THRESHOLD,
  localMaxOptimizeRounds: LOCAL_SEO_MAX_OPTIMIZE_ROUNDS,
  localRetryExtraRounds: LOCAL_SEO_RETRY_EXTRA_ROUNDS,
  semrushMaxOptimizeRounds: SEMRUSH_MAX_OPTIMIZE_ROUNDS,
  semrushRetryExtraRounds: SEMRUSH_RETRY_EXTRA_ROUNDS,
  serpArticleLimit: 5,
  serpArticlesOnly: true,
  serpCountry: "US" as (typeof serpCountryOptions)[number]["value"],
  serpOrganicFetchNum: 30,
  serpMinArticleCandidates: 3,
  serpCacheTtlHours: 24,
  cmsType: "" as "" | "wordpress" | "shopify",
  wpBaseUrl: "",
  wpUsername: "",
  wpAppPassword: "",
  wpPasswordConfigured: false,
  wpDefaultStatus: "draft" as "draft" | "publish",
  shopDomain: "",
  shopAccessToken: "",
  shopTokenConfigured: false,
  shopBlogId: "",
  shopProductId: "",
  shopPublishTarget: "blog" as "blog" | "product",
  shopDefaultPublished: false
});

const selectedSite = computed(
  () => sites.value.find((site) => site.id === selectedSiteId.value) ?? null
);

function resetAdminForm() {
  adminForm.requireBriefApproval = false;
  adminForm.enableParaphrase = true;
  adminForm.enableIllustration = true;
  adminForm.scoreCalibrationShadow = true;
  adminForm.scoreCalibrationReduceRpa = false;
  adminForm.scoreCalibrationLocalAlign = false;
  adminForm.localPassThreshold = LOCAL_SEO_PASS_THRESHOLD;
  adminForm.semrushPassThreshold = SEMRUSH_PASS_THRESHOLD;
  adminForm.localMaxOptimizeRounds = LOCAL_SEO_MAX_OPTIMIZE_ROUNDS;
  adminForm.localRetryExtraRounds = LOCAL_SEO_RETRY_EXTRA_ROUNDS;
  adminForm.semrushMaxOptimizeRounds = SEMRUSH_MAX_OPTIMIZE_ROUNDS;
  adminForm.semrushRetryExtraRounds = SEMRUSH_RETRY_EXTRA_ROUNDS;
  adminForm.serpArticleLimit = 5;
  adminForm.serpArticlesOnly = true;
  adminForm.serpCountry = "US";
  adminForm.serpOrganicFetchNum = 30;
  adminForm.serpMinArticleCandidates = 3;
  adminForm.serpCacheTtlHours = 24;
  adminForm.cmsType = "";
  adminForm.wpBaseUrl = "";
  adminForm.wpUsername = "";
  adminForm.wpAppPassword = "";
  adminForm.wpPasswordConfigured = false;
  adminForm.wpDefaultStatus = "draft";
  adminForm.shopDomain = "";
  adminForm.shopAccessToken = "";
  adminForm.shopTokenConfigured = false;
  adminForm.shopBlogId = "";
  adminForm.shopProductId = "";
  adminForm.shopPublishTarget = "blog";
  adminForm.shopDefaultPublished = false;
  shopifyBlogs.value = [];
  shopifyProducts.value = [];
}

function loadAdminFormFromSite(site: SiteItem) {
  resetAdminForm();
  adminForm.requireBriefApproval = site.workflow?.requireBriefApproval ?? false;
  adminForm.enableParaphrase = site.workflow?.enableParaphrase !== false;
  adminForm.enableIllustration = site.workflow?.enableIllustration !== false;
  adminForm.scoreCalibrationShadow = site.workflow?.scoreCalibrationShadow !== false;
  adminForm.scoreCalibrationReduceRpa = site.workflow?.scoreCalibrationReduceRpa === true;
  adminForm.scoreCalibrationLocalAlign = site.workflow?.scoreCalibrationLocalAlign === true;
  adminForm.localPassThreshold = site.workflow?.localPassThreshold ?? LOCAL_SEO_PASS_THRESHOLD;
  adminForm.semrushPassThreshold = site.workflow?.semrushPassThreshold ?? SEMRUSH_PASS_THRESHOLD;
  adminForm.localMaxOptimizeRounds =
    site.workflow?.localMaxOptimizeRounds ?? LOCAL_SEO_MAX_OPTIMIZE_ROUNDS;
  adminForm.localRetryExtraRounds =
    site.workflow?.localRetryExtraRounds ?? LOCAL_SEO_RETRY_EXTRA_ROUNDS;
  adminForm.semrushMaxOptimizeRounds =
    site.workflow?.semrushMaxOptimizeRounds ?? SEMRUSH_MAX_OPTIMIZE_ROUNDS;
  adminForm.semrushRetryExtraRounds =
    site.workflow?.semrushRetryExtraRounds ?? SEMRUSH_RETRY_EXTRA_ROUNDS;
  adminForm.serpArticleLimit = site.serpResearch?.articleLimit ?? 5;
  adminForm.serpArticlesOnly = site.serpResearch?.articlesOnly !== false;
  adminForm.serpCountry = site.serpResearch?.country ?? "US";
  adminForm.serpOrganicFetchNum = site.serpResearch?.organicFetchNum ?? 30;
  adminForm.serpMinArticleCandidates = site.serpResearch?.minArticleCandidates ?? 3;
  adminForm.serpCacheTtlHours = site.serpResearch?.cacheTtlHours ?? 24;
  adminForm.cmsType =
    site.cmsType === "wordpress" || site.cmsType === "shopify" ? site.cmsType : "";

  if (isWordPressCmsConfig(site.cmsType, site.cmsConfig)) {
    adminForm.wpBaseUrl = site.cmsConfig.baseUrl;
    adminForm.wpUsername = site.cmsConfig.username;
    adminForm.wpPasswordConfigured = site.cmsConfig.hasApplicationPassword;
    adminForm.wpDefaultStatus = site.cmsConfig.defaultStatus;
  }

  if (isShopifyCmsConfig(site.cmsType, site.cmsConfig)) {
    adminForm.shopDomain = site.cmsConfig.shopDomain;
    adminForm.shopBlogId = site.cmsConfig.blogId;
    adminForm.shopProductId = site.cmsConfig.productId ?? "";
    adminForm.shopPublishTarget = site.cmsConfig.publishTarget ?? "blog";
    adminForm.shopTokenConfigured = site.cmsConfig.hasAccessToken;
    adminForm.shopDefaultPublished = site.cmsConfig.defaultPublished;
    if (adminForm.shopTokenConfigured) {
      void loadShopifyBlogs();
      if (adminForm.shopPublishTarget === "product") void loadShopifyProducts();
    }
  }
}

function syncSelectedSiteFromRoute() {
  const querySiteId = route.query.siteId;
  if (typeof querySiteId === "string" && sites.value.some((site) => site.id === querySiteId)) {
    selectedSiteId.value = querySiteId;
    return;
  }
  if (!selectedSiteId.value && sites.value.length > 0) {
    selectedSiteId.value = sites.value[0].id;
  }
}

function onSiteChange() {
  const site = selectedSite.value;
  if (site) loadAdminFormFromSite(site);
  router.replace({
    name: "SeoFactorySettings",
    params: { projectId },
    query: selectedSiteId.value ? { siteId: selectedSiteId.value } : undefined
  });
}

function buildAdminPayload() {
  const payload: Parameters<typeof updateSite>[2] = {
    workflow: {
      requireBriefApproval: adminForm.requireBriefApproval,
      enableParaphrase: adminForm.enableParaphrase,
      enableIllustration: adminForm.enableIllustration,
      scoreCalibrationShadow: adminForm.scoreCalibrationShadow,
      scoreCalibrationReduceRpa: adminForm.scoreCalibrationReduceRpa,
      scoreCalibrationLocalAlign: adminForm.scoreCalibrationLocalAlign,
      localPassThreshold: adminForm.localPassThreshold,
      semrushPassThreshold: adminForm.semrushPassThreshold,
      localMaxOptimizeRounds: adminForm.localMaxOptimizeRounds,
      localRetryExtraRounds: adminForm.localRetryExtraRounds,
      semrushMaxOptimizeRounds: adminForm.semrushMaxOptimizeRounds,
      semrushRetryExtraRounds: adminForm.semrushRetryExtraRounds
    },
    serpResearch: {
      articleLimit: adminForm.serpArticleLimit,
      articlesOnly: adminForm.serpArticlesOnly,
      country: adminForm.serpCountry,
      organicFetchNum: adminForm.serpOrganicFetchNum,
      minArticleCandidates: adminForm.serpMinArticleCandidates,
      cacheTtlHours: adminForm.serpCacheTtlHours
    }
  };

  if (cmsUiEnabled && adminForm.cmsType === "wordpress") {
    payload.cmsType = "wordpress";
    payload.wordpress = {
      baseUrl: adminForm.wpBaseUrl.trim(),
      username: adminForm.wpUsername.trim(),
      defaultStatus: adminForm.wpDefaultStatus,
      ...(adminForm.wpAppPassword.trim()
        ? { applicationPassword: adminForm.wpAppPassword.trim() }
        : {})
    };
  } else if (cmsUiEnabled && adminForm.cmsType === "shopify") {
    payload.cmsType = "shopify";
    payload.shopify = {
      shopDomain: adminForm.shopDomain.trim(),
      publishTarget: adminForm.shopPublishTarget,
      defaultPublished: adminForm.shopDefaultPublished,
      ...(adminForm.shopPublishTarget === "blog"
        ? { blogId: adminForm.shopBlogId.trim() }
        : { productId: adminForm.shopProductId.trim() }),
      ...(adminForm.shopAccessToken.trim()
        ? { accessToken: adminForm.shopAccessToken.trim() }
        : {})
    };
  } else {
    payload.cmsType = null;
  }

  return payload;
}

async function loadShopifyBlogs() {
  if (!adminForm.shopDomain.trim()) {
    message("请填写店铺域名", { type: "warning" });
    return;
  }
  if (!adminForm.shopAccessToken.trim() && !adminForm.shopTokenConfigured) {
    message("请填写 Admin Token", { type: "warning" });
    return;
  }

  shopifyBlogsLoading.value = true;
  try {
    shopifyBlogs.value = await listShopifyBlogs(projectId, {
      siteId: selectedSiteId.value || undefined,
      shopDomain: adminForm.shopDomain.trim(),
      accessToken: adminForm.shopAccessToken.trim() || undefined
    });
  } finally {
    shopifyBlogsLoading.value = false;
  }
}

async function loadShopifyProducts() {
  if (!adminForm.shopDomain.trim()) {
    message("请填写店铺域名", { type: "warning" });
    return;
  }
  if (!adminForm.shopAccessToken.trim() && !adminForm.shopTokenConfigured) {
    message("请填写 Admin Token", { type: "warning" });
    return;
  }

  shopifyProductsLoading.value = true;
  try {
    shopifyProducts.value = await listShopifyProducts(projectId, {
      siteId: selectedSiteId.value || undefined,
      shopDomain: adminForm.shopDomain.trim(),
      accessToken: adminForm.shopAccessToken.trim() || undefined
    });
  } finally {
    shopifyProductsLoading.value = false;
  }
}

async function handleClearSerpCache() {
  if (!selectedSiteId.value) return;

  clearingSerpCache.value = true;
  try {
    const result = await clearSiteSerpCache(projectId, selectedSiteId.value);
    message(`已清除 ${result.deleted} 条搜索缓存`, { type: "success" });
  } finally {
    clearingSerpCache.value = false;
  }
}

async function submitAdminForm() {
  if (!selectedSiteId.value) return;

  const payload = buildAdminPayload();

  if (cmsUiEnabled && adminForm.cmsType === "wordpress") {
    if (!payload.wordpress?.baseUrl || !payload.wordpress.username) {
      message("请填写 WordPress 站点 URL 与用户名", { type: "warning" });
      return;
    }
    if (!payload.wordpress.applicationPassword && !adminForm.wpPasswordConfigured) {
      message("请填写 WordPress Application Password", { type: "warning" });
      return;
    }
  }

  if (cmsUiEnabled && adminForm.cmsType === "shopify") {
    if (!payload.shopify?.shopDomain) {
      message("请填写 Shopify 店铺域名", { type: "warning" });
      return;
    }
    if (adminForm.shopPublishTarget === "blog" && !payload.shopify.blogId) {
      message("请选择 Shopify Blog", { type: "warning" });
      return;
    }
    if (adminForm.shopPublishTarget === "product" && !payload.shopify.productId) {
      message("请选择 Shopify Product", { type: "warning" });
      return;
    }
    if (!payload.shopify.accessToken && !adminForm.shopTokenConfigured) {
      message("请填写 Shopify Admin API Access Token", { type: "warning" });
      return;
    }
  }

  saving.value = true;
  try {
    await updateSite(projectId, selectedSiteId.value, payload);
    message("设置已保存", { type: "success" });
    await loadSites();
  } finally {
    saving.value = false;
  }
}

async function loadCalibrationReadiness() {
  try {
    calibrationReadiness.value = await getScoreCalibrationReadiness(projectId);
  } catch {
    calibrationReadiness.value = null;
  }
}

async function loadSites() {
  sitesLoading.value = true;
  try {
    sites.value = await listSites(projectId);
    syncSelectedSiteFromRoute();
    const site = selectedSite.value;
    if (site) loadAdminFormFromSite(site);
  } finally {
    sitesLoading.value = false;
  }
}

function scrollToGscIfNeeded() {
  if (route.hash !== "#gsc") return;
  requestAnimationFrame(() => {
    document.getElementById("gsc")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function goContentScore() {
  router.push({ name: "SeoFactoryContentScore", params: { projectId } });
}

function goScoreLab() {
  router.push({ name: "SeoFactoryScoreLab", params: { projectId } });
}

watch(
  () => route.query.siteId,
  () => {
    syncSelectedSiteFromRoute();
    const site = selectedSite.value;
    if (site) loadAdminFormFromSite(site);
  }
);

watch(
  () => route.hash,
  () => {
    scrollToGscIfNeeded();
  }
);

onMounted(() => {
  void loadSites();
  void loadCalibrationReadiness();
  scrollToGscIfNeeded();
});
</script>
