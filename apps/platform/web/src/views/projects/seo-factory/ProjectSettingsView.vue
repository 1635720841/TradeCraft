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

        <el-divider content-position="left">搜索结果 / 竞品分析</el-divider>

        <el-form-item label="参考竞品篇数">
          <el-input-number v-model="adminForm.serpArticleLimit" :min="1" :max="20" />
          <p class="mt-1 text-xs text-gray-500">
            生成大纲时最多参考几篇竞品，默认 5。产品型搜索词可酌情调高。
          </p>
        </el-form-item>

        <el-form-item label="只分析博客页">
          <el-switch v-model="adminForm.serpArticlesOnly" />
          <p class="mt-1 text-xs text-gray-500">
            开启后优先博客/资讯类页面；样本不足时系统会自动补充公司页等（仍排除电商）。
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

            <el-form-item label="自动补充阈值">
              <el-input-number v-model="adminForm.serpMinArticleCandidates" :min="1" :max="20" />
              <p class="mt-1 text-xs text-gray-500">
                博客类不足该数时，从其余搜索结果回补，默认 3。
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

    <div id="gsc" class="settings-gsc">
      <GscPerformanceView embedded />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
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
const selectedSiteId = ref("");

const serpCacheTtlOptions = [
  { value: 0, label: "不缓存（每次都实时拉取）" },
  { value: 6, label: "6 小时" },
  { value: 12, label: "12 小时" },
  { value: 24, label: "24 小时（推荐）" },
  { value: 48, label: "48 小时" },
  { value: 168, label: "7 天" }
];

const adminForm = reactive({
  requireBriefApproval: false,
  enableParaphrase: true,
  serpArticleLimit: 5,
  serpArticlesOnly: true,
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
  adminForm.serpArticleLimit = 5;
  adminForm.serpArticlesOnly = true;
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
  adminForm.serpArticleLimit = site.serpResearch?.articleLimit ?? 5;
  adminForm.serpArticlesOnly = site.serpResearch?.articlesOnly !== false;
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
      enableParaphrase: adminForm.enableParaphrase
    },
    serpResearch: {
      articleLimit: adminForm.serpArticleLimit,
      articlesOnly: adminForm.serpArticlesOnly,
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
  scrollToGscIfNeeded();
});
</script>