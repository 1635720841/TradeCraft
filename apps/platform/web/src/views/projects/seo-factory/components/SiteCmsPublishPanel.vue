<!--
  站点 CMS 发布集成配置。

  边界：
  - 不负责：工作流开关（ProjectSettingsView）
-->
<template>
  <div v-loading="loading">
    <el-alert
      v-if="!canManage"
      class="mb-4"
      type="info"
      :closable="false"
      show-icon
      title="您仅有查看权限"
    />

    <el-form :model="form" label-width="120px" :disabled="!canManage">
      <el-form-item label="CMS 类型">
        <el-select v-model="form.cmsType" class="w-full" clearable placeholder="不启用">
          <el-option label="WordPress" value="wordpress" />
          <el-option label="Shopify" value="shopify" />
        </el-select>
      </el-form-item>

      <template v-if="form.cmsType === 'wordpress'">
        <el-form-item label="站点 URL">
          <el-input v-model="form.wpBaseUrl" placeholder="https://example.com" />
        </el-form-item>
        <el-form-item label="用户名">
          <el-input v-model="form.wpUsername" placeholder="WordPress 用户名" />
        </el-form-item>
        <el-form-item label="应用密码">
          <el-input
            v-model="form.wpAppPassword"
            type="password"
            show-password
            :placeholder="form.wpPasswordConfigured ? '留空则保留原密码' : 'WordPress Application Password'"
          />
        </el-form-item>
        <el-form-item label="默认状态">
          <el-select v-model="form.wpDefaultStatus" class="w-full">
            <el-option label="草稿（推荐）" value="draft" />
            <el-option label="直接发布" value="publish" />
          </el-select>
        </el-form-item>
      </template>

      <template v-else-if="form.cmsType === 'shopify'">
        <el-form-item label="店铺域名">
          <el-input v-model="form.shopDomain" placeholder="your-store.myshopify.com" />
        </el-form-item>
        <el-form-item label="Admin Token">
          <el-input
            v-model="form.shopAccessToken"
            type="password"
            show-password
            :placeholder="form.shopTokenConfigured ? '留空则保留原 Token' : 'shpat_...'"
          />
        </el-form-item>
        <el-form-item label="推送目的地">
          <el-radio-group v-model="form.shopPublishTarget">
            <el-radio value="blog">Blog 文章</el-radio>
            <el-radio value="product">产品详情页</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="form.shopPublishTarget === 'blog'" label="Blog">
          <div class="flex w-full gap-2">
            <el-select
              v-model="form.shopBlogId"
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
              v-model="form.shopProductId"
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
            v-model="form.shopDefaultPublished"
            active-text="直接发布"
            inactive-text="草稿"
          />
        </el-form-item>
      </template>

      <el-form-item v-if="canManage">
        <el-button type="primary" :loading="saving" @click="submit">保存发布集成</el-button>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from "vue";
import {
  getSite,
  listShopifyBlogs,
  listShopifyProducts,
  updateSite
} from "@/api/seo-factory/site";
import type { ShopifyBlogItem, ShopifyProductItem, SiteItem } from "@/api/seo-factory/types";
import { isShopifyCmsConfig, isWordPressCmsConfig } from "@/api/seo-factory/types";
import { WORDPRESS_CMS_UI_ENABLED } from "@/constants/feature-flags";
import { message } from "@/utils/message";

defineOptions({ name: "SiteCmsPublishPanel" });

const props = defineProps<{
  projectId: string;
  siteId: string;
  canManage: boolean;
}>();

const emit = defineEmits<{ saved: [site: SiteItem] }>();

const cmsUiEnabled = WORDPRESS_CMS_UI_ENABLED;
const loading = ref(false);
const saving = ref(false);
const shopifyBlogsLoading = ref(false);
const shopifyProductsLoading = ref(false);
const shopifyBlogs = ref<ShopifyBlogItem[]>([]);
const shopifyProducts = ref<ShopifyProductItem[]>([]);

const form = reactive({
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

function resetForm() {
  form.cmsType = "";
  form.wpBaseUrl = "";
  form.wpUsername = "";
  form.wpAppPassword = "";
  form.wpPasswordConfigured = false;
  form.wpDefaultStatus = "draft";
  form.shopDomain = "";
  form.shopAccessToken = "";
  form.shopTokenConfigured = false;
  form.shopBlogId = "";
  form.shopProductId = "";
  form.shopPublishTarget = "blog";
  form.shopDefaultPublished = false;
  shopifyBlogs.value = [];
  shopifyProducts.value = [];
}

function loadFormFromSite(site: SiteItem) {
  resetForm();
  form.cmsType = site.cmsType === "wordpress" || site.cmsType === "shopify" ? site.cmsType : "";

  if (isWordPressCmsConfig(site.cmsType, site.cmsConfig)) {
    form.wpBaseUrl = site.cmsConfig.baseUrl;
    form.wpUsername = site.cmsConfig.username;
    form.wpPasswordConfigured = site.cmsConfig.hasApplicationPassword;
    form.wpDefaultStatus = site.cmsConfig.defaultStatus;
  }

  if (isShopifyCmsConfig(site.cmsType, site.cmsConfig)) {
    form.shopDomain = site.cmsConfig.shopDomain;
    form.shopBlogId = site.cmsConfig.blogId;
    form.shopProductId = site.cmsConfig.productId ?? "";
    form.shopPublishTarget = site.cmsConfig.publishTarget ?? "blog";
    form.shopTokenConfigured = site.cmsConfig.hasAccessToken;
    form.shopDefaultPublished = site.cmsConfig.defaultPublished;
    if (form.shopTokenConfigured) {
      void loadShopifyBlogs();
      if (form.shopPublishTarget === "product") void loadShopifyProducts();
    }
  }
}

async function loadSite() {
  if (!props.siteId) return;
  loading.value = true;
  try {
    const site = await getSite(props.projectId, props.siteId);
    loadFormFromSite(site);
  } finally {
    loading.value = false;
  }
}

function buildPayload(): Parameters<typeof updateSite>[2] {
  const payload: Parameters<typeof updateSite>[2] = {};

  if (!cmsUiEnabled || !form.cmsType) {
    payload.cmsType = null;
    return payload;
  }

  if (form.cmsType === "wordpress") {
    payload.cmsType = "wordpress";
    payload.wordpress = {
      baseUrl: form.wpBaseUrl.trim(),
      username: form.wpUsername.trim(),
      defaultStatus: form.wpDefaultStatus,
      ...(form.wpAppPassword.trim() ? { applicationPassword: form.wpAppPassword.trim() } : {})
    };
  } else {
    payload.cmsType = "shopify";
    payload.shopify = {
      shopDomain: form.shopDomain.trim(),
      publishTarget: form.shopPublishTarget,
      defaultPublished: form.shopDefaultPublished,
      ...(form.shopPublishTarget === "blog"
        ? { blogId: form.shopBlogId.trim() }
        : { productId: form.shopProductId.trim() }),
      ...(form.shopAccessToken.trim() ? { accessToken: form.shopAccessToken.trim() } : {})
    };
  }

  return payload;
}

async function loadShopifyBlogs() {
  if (!form.shopDomain.trim()) {
    message("请填写店铺域名", { type: "warning" });
    return;
  }
  if (!form.shopAccessToken.trim() && !form.shopTokenConfigured) {
    message("请填写 Admin Token", { type: "warning" });
    return;
  }

  shopifyBlogsLoading.value = true;
  try {
    shopifyBlogs.value = await listShopifyBlogs(props.projectId, {
      siteId: props.siteId,
      shopDomain: form.shopDomain.trim(),
      accessToken: form.shopAccessToken.trim() || undefined
    });
  } finally {
    shopifyBlogsLoading.value = false;
  }
}

async function loadShopifyProducts() {
  if (!form.shopDomain.trim()) {
    message("请填写店铺域名", { type: "warning" });
    return;
  }
  if (!form.shopAccessToken.trim() && !form.shopTokenConfigured) {
    message("请填写 Admin Token", { type: "warning" });
    return;
  }

  shopifyProductsLoading.value = true;
  try {
    shopifyProducts.value = await listShopifyProducts(props.projectId, {
      siteId: props.siteId,
      shopDomain: form.shopDomain.trim(),
      accessToken: form.shopAccessToken.trim() || undefined
    });
  } finally {
    shopifyProductsLoading.value = false;
  }
}

async function submit() {
  if (!props.canManage) return;

  const payload = buildPayload();

  if (cmsUiEnabled && form.cmsType === "wordpress") {
    if (!payload.wordpress?.baseUrl || !payload.wordpress.username) {
      message("请填写 WordPress 站点 URL 与用户名", { type: "warning" });
      return;
    }
    if (!payload.wordpress.applicationPassword && !form.wpPasswordConfigured) {
      message("请填写 WordPress Application Password", { type: "warning" });
      return;
    }
  }

  if (cmsUiEnabled && form.cmsType === "shopify") {
    if (!payload.shopify?.shopDomain) {
      message("请填写 Shopify 店铺域名", { type: "warning" });
      return;
    }
    if (form.shopPublishTarget === "blog" && !payload.shopify.blogId) {
      message("请选择 Shopify Blog", { type: "warning" });
      return;
    }
    if (form.shopPublishTarget === "product" && !payload.shopify.productId) {
      message("请选择 Shopify Product", { type: "warning" });
      return;
    }
    if (!payload.shopify.accessToken && !form.shopTokenConfigured) {
      message("请填写 Shopify Admin API Access Token", { type: "warning" });
      return;
    }
  }

  saving.value = true;
  try {
    const site = await updateSite(props.projectId, props.siteId, payload);
    message("发布集成已保存", { type: "success" });
    loadFormFromSite(site);
    emit("saved", site);
  } finally {
    saving.value = false;
  }
}

watch(
  () => props.siteId,
  () => {
    void loadSite();
  },
  { immediate: true }
);
</script>
