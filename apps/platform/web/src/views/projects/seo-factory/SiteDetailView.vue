<!--
  站点详情：基础信息、写作素材、发布集成、页面库与搜索表现。

  边界：
  - 不负责：项目级流程调参（ProjectSettingsView）
-->
<template>
  <div v-loading="pageLoading && !loadError" class="p-4 space-y-4">
    <el-alert
      v-if="loadError"
      type="error"
      :closable="false"
      show-icon
      class="mb-4"
      title="站点加载失败"
      :description="loadError"
    >
      <template #default>
        <div class="mt-2 flex gap-2">
          <el-button type="primary" size="small" @click="loadSite">重试</el-button>
          <el-button size="small" @click="goBack">返回站点列表</el-button>
        </div>
      </template>
    </el-alert>

    <template v-if="!loadError">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <el-button link type="primary" @click="goBack">← 返回站点列表</el-button>
        <span class="text-lg font-medium">{{ site?.domain ?? "站点" }}</span>
        <el-tag v-if="site && siteItemHasMinWritingProfile(site)" size="small" type="success">
          素材已达标
        </el-tag>
        <el-tag v-else-if="site" size="small" type="warning">素材待完善</el-tag>
      </div>
      <div class="flex gap-2">
        <el-button v-if="canManageSite" :loading="saving" type="primary" @click="submitSiteForm">
          保存
        </el-button>
        <el-button v-if="site" @click="openAttributionExportDialog">导出转化追踪表</el-button>
      </div>
    </div>

    <el-tabs v-model="activeTab" @tab-change="onTabChange">
      <el-tab-pane label="基础信息" name="basic">
        <el-form ref="formRef" :model="siteForm" :rules="siteRules" label-width="100px" :disabled="!canManageSite">
          <el-form-item label="域名" prop="domain">
            <el-input v-model="siteForm.domain" placeholder="例如 example.com" />
          </el-form-item>
          <el-form-item label="目标市场">
            <el-select
              v-model="siteForm.targetMarkets"
              class="w-full"
              multiple
              collapse-tags
              collapse-tags-tooltip
              clearable
              filterable
              allow-create
              default-first-option
            >
              <el-option
                v-for="item in targetMarketOptions"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="输出语言" prop="contentLanguage">
            <el-select v-model="siteForm.contentLanguage" class="w-full">
              <el-option
                v-for="item in contentLanguageOptions"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
            <p class="mt-1 text-xs text-gray-500">{{ outputLanguageHint }}</p>
          </el-form-item>
          <el-form-item label="品牌语气">
            <el-input
              v-model="siteForm.brandVoice"
              type="textarea"
              :rows="2"
              maxlength="2000"
              placeholder="例如：专业务实，面向采购与工程师读者"
            />
          </el-form-item>
          <el-form-item label="负责人">
            <el-select v-model="siteForm.ownerUserId" clearable filterable class="w-full" placeholder="可选">
              <el-option
                v-for="member in projectMembers"
                :key="member.userId"
                :label="`${member.email}${member.name ? ` (${member.name})` : ''}`"
                :value="member.userId"
              />
            </el-select>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <el-tab-pane label="写作素材" name="profile">
        <p class="mb-4 text-sm text-gray-500">填一次，该站点下每篇新文章生成时都会自动带上。</p>
        <el-form :model="siteForm" label-width="100px" :disabled="!canManageSite">
          <el-form-item label="主营行业">
            <el-input v-model="siteForm.industry" maxlength="200" placeholder="例如：工业阀门制造商" />
          </el-form-item>
          <el-form-item label="核心产品线">
            <el-input
              v-model="siteForm.productLines"
              type="textarea"
              :rows="2"
              maxlength="500"
              placeholder="例如：球阀、蝶阀、闸阀"
            />
          </el-form-item>
          <el-form-item label="差异化卖点">
            <div class="w-full space-y-2">
              <el-input v-model="siteForm.differentiator1" maxlength="200" placeholder="卖点 1" />
              <el-input v-model="siteForm.differentiator2" maxlength="200" placeholder="卖点 2（可选）" />
              <el-input v-model="siteForm.differentiator3" maxlength="200" placeholder="卖点 3（可选）" />
            </div>
          </el-form-item>
          <el-form-item label="认证资质">
            <el-input
              v-model="siteForm.certifications"
              type="textarea"
              :rows="2"
              maxlength="500"
              placeholder="例如：ISO 9001、CE、UL"
            />
          </el-form-item>
          <el-form-item label="起订 / 交期">
            <el-input v-model="siteForm.moqLeadTime" maxlength="300" placeholder="例如：MOQ 100 件，交期 15–30 天" />
          </el-form-item>
          <el-form-item label="目标客户">
            <el-input v-model="siteForm.targetBuyerType" maxlength="120" placeholder="例如：海外经销商、OEM 采购商" />
          </el-form-item>
          <el-form-item label="案例亮点">
            <el-input
              v-model="siteForm.caseHighlights"
              type="textarea"
              :rows="2"
              maxlength="500"
              placeholder="例如：为××品牌代工，出口欧美 20+ 国"
            />
          </el-form-item>
          <el-form-item label="文末引导">
            <el-input v-model="siteForm.ctaPrimaryText" maxlength="120" placeholder="例如：获取报价" />
          </el-form-item>
          <el-form-item label="引导链接">
            <el-input v-model="siteForm.ctaPrimaryUrl" maxlength="500" placeholder="https://..." />
          </el-form-item>
          <el-form-item label="禁用词">
            <el-input
              v-model="siteForm.forbiddenTerms"
              type="textarea"
              :rows="2"
              maxlength="500"
              placeholder="每行或逗号分隔"
            />
          </el-form-item>
          <el-divider content-position="left">转化追踪参数</el-divider>
          <el-alert class="mb-4" type="info" :closable="false" show-icon title="转化追踪表">
            <SiteConversionTrackingHelpPanel />
          </el-alert>
          <el-form-item label="来源">
            <el-input v-model="siteForm.utmSource" maxlength="80" placeholder="seo-factory" />
            <p class="mt-1 text-xs text-gray-500">
              统计里标记「流量从哪来」，新建站点默认
              <span class="font-mono">seo-factory</span>，可按需修改。
            </p>
          </el-form-item>
          <el-form-item label="媒介">
            <el-input v-model="siteForm.utmMedium" maxlength="80" placeholder="blog" />
            <p class="mt-1 text-xs text-gray-500">
              统计里标记「什么渠道」，新建站点默认 <span class="font-mono">blog</span>，可按需修改。
            </p>
          </el-form-item>
          <el-form-item label="活动">
            <el-input v-model="siteForm.utmCampaign" maxlength="120" :placeholder="utmCampaignPlaceholder" />
            <p class="mt-1 text-xs text-gray-500">
              统计里标记「哪批推广」，新建站点默认按域名生成（如
              <span class="font-mono">ayaauavpower-com</span>），可按需修改。
            </p>
          </el-form-item>
          <el-form-item v-if="contentProfilePreview" label="生成预览">
            <div class="whitespace-pre-wrap rounded bg-gray-50 px-3 py-2 text-sm text-gray-700">
              {{ contentProfilePreview }}
            </div>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <el-tab-pane v-if="canManageSite" label="发布集成" name="publish" lazy>
        <SiteCmsPublishPanel
          :project-id="projectId"
          :site-id="siteId"
          :can-manage="canManageSite"
          @saved="onSiteUpdated"
        />
      </el-tab-pane>

      <el-tab-pane v-if="canManageSite" label="页面库" name="pages" lazy>
        <SitePageLibraryPanel :project-id="projectId" :site-id="siteId" :site-domain="site?.domain" />
      </el-tab-pane>

      <el-tab-pane label="搜索表现" name="search" lazy>
        <GscPerformanceView embedded :filter-site-id="siteId" />
      </el-tab-pane>
    </el-tabs>

    <SiteConversionTrackingExportDialog
      v-if="site"
      v-model="attributionExportDialogVisible"
      :project-id="projectId"
      :site-id="site.id"
      :site-domain="site.domain"
    />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { FormInstance, FormRules } from "element-plus";
import { getSite, updateSite } from "@/api/seo-factory/site";
import type { SiteItem } from "@/api/seo-factory/types";
import { listProjectMembers, type OrgProjectMember } from "@/api/org/projects";
import {
  CONTENT_LANGUAGE_OPTIONS,
  TARGET_MARKET_OPTIONS,
  type ContentLanguageCode
} from "@/constants/dicts/seo-factory";
import { message } from "@/utils/message";
import { siteItemHasMinWritingProfile } from "@/utils/seo-factory/site-writing-profile";
import { resolveSiteUtmDefaults, domainToUtmCampaign } from "@/utils/seo-factory/site-utm-defaults";
import { parseTargetMarkets } from "@/utils/seo-factory/target-market";
import { useProjectSeoAccess } from "@/composables/seo-factory/useProjectSeoAccess";
import GscPerformanceView from "./GscPerformanceView.vue";
import SiteCmsPublishPanel from "./components/SiteCmsPublishPanel.vue";
import SitePageLibraryPanel from "./components/SitePageLibraryPanel.vue";
import SiteConversionTrackingHelpPanel from "./components/SiteConversionTrackingHelpPanel.vue";
import SiteConversionTrackingExportDialog from "./components/SiteConversionTrackingExportDialog.vue";

defineOptions({ name: "SiteDetailView" });

type SiteTab = "basic" | "profile" | "publish" | "pages" | "search";

const route = useRoute();
const router = useRouter();
const projectId = route.params.projectId as string;
const siteId = computed(() => route.params.siteId as string);
const { can } = useProjectSeoAccess();
const canManageSite = computed(() => can("seo:site:manage"));

const pageLoading = ref(false);
const loadError = ref("");
const saving = ref(false);
const attributionExportDialogVisible = ref(false);
const site = ref<SiteItem | null>(null);
const projectMembers = ref<OrgProjectMember[]>([]);
const formRef = ref<FormInstance>();
const activeTab = ref<SiteTab>("basic");

const contentLanguageOptions = CONTENT_LANGUAGE_OPTIONS;
const targetMarketOptions = TARGET_MARKET_OPTIONS;

const siteForm = reactive({
  domain: "",
  targetMarkets: [] as string[],
  contentLanguage: "en" as ContentLanguageCode,
  brandVoice: "",
  industry: "",
  certifications: "",
  moqLeadTime: "",
  ctaPrimaryText: "",
  ctaPrimaryUrl: "",
  utmSource: "",
  utmMedium: "",
  utmCampaign: "",
  productLines: "",
  differentiator1: "",
  differentiator2: "",
  differentiator3: "",
  targetBuyerType: "",
  caseHighlights: "",
  forbiddenTerms: "",
  ownerUserId: "" as string
});

const siteRules: FormRules = {
  domain: [
    { required: true, message: "请输入域名", trigger: "blur" },
    { min: 3, message: "至少 3 个字符", trigger: "blur" }
  ],
  contentLanguage: [{ required: true, message: "请选择语言", trigger: "change" }]
};

const outputLanguageHint = computed(() =>
  siteForm.contentLanguage === "zh-CN"
    ? "文章将生成简体中文，建议写作素材也用中文填写。"
    : "文章将生成英文，建议写作素材也用英文填写。"
);

const utmCampaignPlaceholder = computed(() =>
  domainToUtmCampaign(siteForm.domain || site.value?.domain || "example.com")
);

const contentProfilePreview = computed(() => {
  const lines: string[] = [];
  if (siteForm.industry.trim()) lines.push(`主营：${siteForm.industry.trim()}`);
  if (siteForm.productLines.trim()) lines.push(`产品线：${siteForm.productLines.trim()}`);
  const diffs = [siteForm.differentiator1, siteForm.differentiator2, siteForm.differentiator3]
    .map((item) => item.trim())
    .filter(Boolean);
  if (diffs.length) lines.push(`卖点：${diffs.join("；")}`);
  if (siteForm.targetBuyerType.trim()) lines.push(`客户：${siteForm.targetBuyerType.trim()}`);
  return lines.join("\n");
});

function syncTabFromRoute() {
  const tab = route.query.tab;
  const allowed: SiteTab[] = canManageSite.value
    ? ["basic", "profile", "publish", "pages", "search"]
    : ["basic", "profile", "search"];
  activeTab.value =
    typeof tab === "string" && allowed.includes(tab as SiteTab) ? (tab as SiteTab) : "basic";
}

function onTabChange(name: string | number) {
  router.replace({
    name: "SeoFactorySiteDetail",
    params: { projectId, siteId: siteId.value },
    query: name === "basic" ? {} : { tab: String(name) }
  });
}

function goBack() {
  router.push({ name: "SeoFactorySites", params: { projectId } });
}

function parseForbiddenTerms(raw: string): string[] {
  return raw
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 10);
}

function buildDifferentiators(): string[] | undefined {
  const items = [siteForm.differentiator1, siteForm.differentiator2, siteForm.differentiator3]
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3);
  return items.length > 0 ? items : undefined;
}

function loadFormFromSite(item: SiteItem) {
  siteForm.domain = item.domain;
  siteForm.targetMarkets = parseTargetMarkets(item.targetMarkets ?? item.targetMarket);
  siteForm.contentLanguage = (item.contentLanguage === "zh-CN" ? "zh-CN" : "en") as ContentLanguageCode;
  siteForm.brandVoice = item.brandVoice ?? "";
  siteForm.industry = item.contentProfile?.industry ?? "";
  siteForm.certifications = item.contentProfile?.certifications ?? "";
  siteForm.moqLeadTime = item.contentProfile?.moqLeadTime ?? "";
  siteForm.ctaPrimaryText = item.contentProfile?.ctaPrimaryText ?? "";
  siteForm.ctaPrimaryUrl = item.contentProfile?.ctaPrimaryUrl ?? "";
  const utmDefaults = resolveSiteUtmDefaults(item.domain);
  siteForm.utmSource = item.contentProfile?.utmSource ?? utmDefaults.utmSource;
  siteForm.utmMedium = item.contentProfile?.utmMedium ?? utmDefaults.utmMedium;
  siteForm.utmCampaign = item.contentProfile?.utmCampaign ?? utmDefaults.utmCampaign;
  siteForm.productLines = item.contentProfile?.productLines ?? "";
  siteForm.differentiator1 = item.contentProfile?.differentiators?.[0] ?? "";
  siteForm.differentiator2 = item.contentProfile?.differentiators?.[1] ?? "";
  siteForm.differentiator3 = item.contentProfile?.differentiators?.[2] ?? "";
  siteForm.targetBuyerType = item.contentProfile?.targetBuyerType ?? "";
  siteForm.caseHighlights = item.contentProfile?.caseHighlights ?? "";
  siteForm.forbiddenTerms = item.contentProfile?.forbiddenTerms?.join("，") ?? "";
  siteForm.ownerUserId = item.ownerUserId ?? "";
}

async function loadSite() {
  pageLoading.value = true;
  loadError.value = "";
  try {
    site.value = await getSite(projectId, siteId.value);
    loadFormFromSite(site.value);
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : "加载站点失败";
    site.value = null;
  } finally {
    pageLoading.value = false;
  }
}

function onSiteUpdated(item: SiteItem) {
  site.value = item;
}

function buildPayload() {
  return {
    domain: siteForm.domain.trim(),
    targetMarkets: siteForm.targetMarkets.length ? siteForm.targetMarkets : undefined,
    contentLanguage: siteForm.contentLanguage,
    brandVoice: siteForm.brandVoice.trim() || undefined,
    contentProfile: {
      industry: siteForm.industry.trim() || undefined,
      certifications: siteForm.certifications.trim() || undefined,
      moqLeadTime: siteForm.moqLeadTime.trim() || undefined,
      ctaPrimaryText: siteForm.ctaPrimaryText.trim() || undefined,
      ctaPrimaryUrl: siteForm.ctaPrimaryUrl.trim() || undefined,
      utmSource: siteForm.utmSource.trim() || undefined,
      utmMedium: siteForm.utmMedium.trim() || undefined,
      utmCampaign: siteForm.utmCampaign.trim() || undefined,
      productLines: siteForm.productLines.trim() || undefined,
      differentiators: buildDifferentiators(),
      targetBuyerType: siteForm.targetBuyerType.trim() || undefined,
      caseHighlights: siteForm.caseHighlights.trim() || undefined,
      forbiddenTerms: (() => {
        const terms = parseForbiddenTerms(siteForm.forbiddenTerms);
        return terms.length > 0 ? terms : undefined;
      })()
    },
    ownerUserId: siteForm.ownerUserId.trim() || null
  } as Parameters<typeof updateSite>[2];
}

async function submitSiteForm() {
  if (!canManageSite.value || !formRef.value) return;
  await formRef.value.validate(async (valid) => {
    if (!valid) {
      activeTab.value = "basic";
      return;
    }
    saving.value = true;
    try {
      site.value = await updateSite(projectId, siteId.value, buildPayload());
      message("站点已保存", { type: "success" });
    } finally {
      saving.value = false;
    }
  });
}

function openAttributionExportDialog() {
  attributionExportDialogVisible.value = true;
}

onMounted(async () => {
  syncTabFromRoute();
  try {
    projectMembers.value = await listProjectMembers(projectId);
  } catch {
    projectMembers.value = [];
  }
  await loadSite();
});

watch(
  () => [route.params.siteId, route.query.tab],
  () => {
    syncTabFromRoute();
    if (route.name === "SeoFactorySiteDetail") void loadSite();
  }
);
</script>
