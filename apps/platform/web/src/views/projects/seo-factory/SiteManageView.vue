<!--
  站点运营配置：域名、语言、品牌语气与公司卖点（AI 写作素材）。

  边界：
  - 不负责：CMS、页面库、工作流（ProjectSettingsView 设置页）
-->
<template>
  <div class="p-4 space-y-4">
    <el-card shadow="never">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="font-medium">站点</span>
          <div class="flex gap-2">
            <el-button v-if="canManageSite" type="primary" @click="openCreateDialog">新建站点</el-button>
            <el-button :loading="sitesLoading" @click="loadSites">刷新</el-button>
          </div>
        </div>
      </template>

      <el-alert
        v-if="profileMissingFilter"
        class="mb-4"
        type="warning"
        :closable="false"
        show-icon
        title="仅显示未填写公司卖点的站点"
      >
        <template #default>
          请编辑站点，补充行业、认证、起订量或文末询盘引导，提升 AI 写作质量。
          <el-button link type="primary" @click="clearProfileFilter">查看全部站点</el-button>
        </template>
      </el-alert>

      <el-table v-loading="sitesLoading" :data="displayedSites" stripe :row-class-name="siteRowClassName">
        <el-table-column prop="domain" label="域名" min-width="180" />
        <el-table-column prop="targetMarket" label="目标市场" width="100">
          <template #default="{ row }">
            {{ row.targetMarket || "-" }}
          </template>
        </el-table-column>
        <el-table-column prop="contentLanguage" label="语言" width="100">
          <template #default="{ row }">
            {{ row.contentLanguage || "-" }}
          </template>
        </el-table-column>
        <el-table-column prop="brandVoice" label="品牌语气" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.brandVoice || "-" }}
          </template>
        </el-table-column>
        <el-table-column label="写作素材" width="100">
          <template #default="{ row }">
            <el-tag v-if="hasWritingProfile(row as SiteItem)" size="small" type="success">已配置</el-tag>
            <span v-else class="text-gray-400">未填</span>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" min-width="170">
          <template #default="{ row }">
            {{ formatTime(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column v-if="canManageSite" label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="openEditDialog(row as SiteItem)">编辑</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-if="!sitesLoading && displayedSites.length === 0" :description="sitesEmptyHint" />
    </el-card>

    <el-dialog
      v-model="siteDialogVisible"
      :title="editingSiteId ? '编辑站点' : '新建站点'"
      width="640px"
      destroy-on-close
    >
      <el-form ref="siteFormRef" :model="siteForm" :rules="siteRules" label-width="120px">
        <el-form-item label="域名" prop="domain">
          <el-input v-model="siteForm.domain" placeholder="例如 example.com" />
        </el-form-item>
        <el-form-item label="目标市场" prop="targetMarket">
          <el-input v-model="siteForm.targetMarket" placeholder="例如 US、CN" />
        </el-form-item>
        <el-form-item label="内容语言" prop="contentLanguage">
          <el-select v-model="siteForm.contentLanguage" class="w-full">
            <el-option
              v-for="item in contentLanguageOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="品牌语气" prop="brandVoice">
          <el-input
            v-model="siteForm.brandVoice"
            type="textarea"
            :rows="3"
            maxlength="2000"
            show-word-limit
            placeholder="例如：专业、务实，面向采购/工程师读者；与下方「公司卖点」一起影响 AI 写法"
          />
        </el-form-item>

        <el-divider content-position="left">公司卖点（AI 写作素材）</el-divider>
        <el-alert class="mb-4" type="info" :closable="false" show-icon>
          <template #title>这项是干什么的？</template>
          <div class="text-sm leading-relaxed">
            <p class="mb-2">
              填一次，该站点下<strong>每篇新文章</strong>生成大纲 / 正文时都会自动带上，不用每单重复写。
            </p>
            <ul class="list-disc space-y-1 pl-5">
              <li><strong>公司信息</strong>：行业、认证、起订量/交期 → 文章里写得更像你们公司、更有可信度</li>
              <li><strong>文末询盘引导</strong>：统一按钮文案 + 链接（如「获取报价」跳到联系页）</li>
            </ul>
            <p class="mt-2 text-gray-600">可不填；做工业/B2B 外贸站建议填写。</p>
          </div>
        </el-alert>
        <el-form-item label="主营行业 / 产品">
          <el-input
            v-model="siteForm.industry"
            maxlength="200"
            placeholder="例如：工业阀门制造商，面向石化、电力行业"
          />
        </el-form-item>
        <el-form-item label="认证资质">
          <el-input
            v-model="siteForm.certifications"
            type="textarea"
            :rows="2"
            maxlength="500"
            placeholder="例如：ISO 9001、CE、UL（写买家常看的资质即可）"
          />
        </el-form-item>
        <el-form-item label="起订量 / 交期">
          <el-input
            v-model="siteForm.moqLeadTime"
            maxlength="300"
            placeholder="例如：MOQ 100 件，常规交期 15–25 天（没有固定数字可写区间或「支持定制」）"
          />
        </el-form-item>
        <el-form-item label="文末引导按钮文案">
          <el-input
            v-model="siteForm.ctaPrimaryText"
            maxlength="120"
            placeholder="例如：获取报价、联系工程师、下载产品目录"
          />
          <p class="mt-1 text-xs text-gray-500">CTA = Call To Action，即文末让读者去询盘/联系的那句行动号召。</p>
        </el-form-item>
        <el-form-item label="引导按钮链接">
          <el-input
            v-model="siteForm.ctaPrimaryUrl"
            maxlength="500"
            placeholder="https://你的站点.com/contact 或询盘表单页"
          />
        </el-form-item>
        <el-form-item label="UTM 来源 (utm_source)">
          <el-input v-model="siteForm.utmSource" maxlength="80" placeholder="例如：seo-factory" />
        </el-form-item>
        <el-form-item label="UTM 媒介 (utm_medium)">
          <el-input v-model="siteForm.utmMedium" maxlength="80" placeholder="例如：blog" />
        </el-form-item>
        <el-form-item label="UTM 活动 (utm_campaign)">
          <el-input v-model="siteForm.utmCampaign" maxlength="120" placeholder="例如：industrial-valves" />
        </el-form-item>

        <el-collapse class="mt-2">
          <el-collapse-item title="高级写作素材（可选）" name="advanced">
            <el-form-item label="核心产品线">
              <el-input
                v-model="siteForm.productLines"
                type="textarea"
                :rows="2"
                maxlength="500"
                placeholder="例如：球阀、蝶阀、闸阀；石化、电力、水处理应用"
              />
            </el-form-item>
            <el-form-item label="差异化卖点">
              <div class="space-y-2 w-full">
                <el-input
                  v-model="siteForm.differentiator1"
                  maxlength="200"
                  placeholder="卖点 1：例如 15 年 OEM/ODM 经验"
                />
                <el-input
                  v-model="siteForm.differentiator2"
                  maxlength="200"
                  placeholder="卖点 2（可选）"
                />
                <el-input
                  v-model="siteForm.differentiator3"
                  maxlength="200"
                  placeholder="卖点 3（可选）"
                />
              </div>
            </el-form-item>
            <el-form-item label="目标客户">
              <el-input
                v-model="siteForm.targetBuyerType"
                maxlength="120"
                placeholder="例如：采购经理、工程承包商、OEM 品牌商"
              />
            </el-form-item>
            <el-form-item label="案例 / 客户类型">
              <el-input
                v-model="siteForm.caseHighlights"
                type="textarea"
                :rows="2"
                maxlength="500"
                placeholder="例如：服务过北美石化分销商；支持匿名案例"
              />
            </el-form-item>
            <el-form-item label="禁用词">
              <el-input
                v-model="siteForm.forbiddenTerms"
                type="textarea"
                :rows="2"
                maxlength="500"
                placeholder="每行或逗号分隔，例如：最便宜、100% 保证、No.1"
              />
              <p class="mt-1 text-xs text-gray-500">AI 生成时会避免使用这些词。</p>
            </el-form-item>
          </el-collapse-item>
        </el-collapse>

        <el-form-item v-if="contentProfilePreview" label="生成时会带上">
          <div class="rounded bg-gray-50 px-3 py-2 text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">
            {{ contentProfilePreview }}
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="siteDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="siteSaving" @click="submitSiteForm">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { FormInstance, FormRules } from "element-plus";
import { createSite, listSites, updateSite } from "@/api/seo-factory/site";
import type { SiteItem } from "@/api/seo-factory/types";
import {
  CONTENT_LANGUAGE_OPTIONS,
  type ContentLanguageCode
} from "@/constants/dicts/seo-factory";
import { message } from "@/utils/message";
import { useProjectSeoAccess } from "@/composables/seo-factory/useProjectSeoAccess";

defineOptions({ name: "SiteManageView" });

const route = useRoute();
const router = useRouter();
const projectId = route.params.projectId as string;
const { can } = useProjectSeoAccess();
const canManageSite = computed(() => can("seo:site:manage"));

const sitesLoading = ref(false);
const siteSaving = ref(false);
const sites = ref<SiteItem[]>([]);
const siteDialogVisible = ref(false);
const editingSiteId = ref("");
const siteFormRef = ref<FormInstance>();

const contentLanguageOptions = CONTENT_LANGUAGE_OPTIONS;

const siteForm = reactive({
  domain: "",
  targetMarket: "",
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
  forbiddenTerms: ""
});

const siteRules: FormRules = {
  domain: [
    { required: true, message: "请输入域名", trigger: "blur" },
    { min: 3, message: "域名至少 3 个字符", trigger: "blur" }
  ],
  contentLanguage: [{ required: true, message: "请选择语言", trigger: "change" }]
};

const profileMissingFilter = computed(
  () => route.query.profile === "missing" || route.query.profile === "1"
);

const displayedSites = computed(() => {
  if (!profileMissingFilter.value) return sites.value;
  return sites.value.filter((site) => !hasWritingProfile(site));
});

const sitesEmptyHint = computed(() =>
  profileMissingFilter.value ? "所有站点均已填写公司卖点" : "暂无站点，请先新建站点"
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
  if (siteForm.certifications.trim()) lines.push(`资质：${siteForm.certifications.trim()}`);
  if (siteForm.moqLeadTime.trim()) lines.push(`起订/交期：${siteForm.moqLeadTime.trim()}`);
  if (siteForm.caseHighlights.trim()) lines.push(`案例：${siteForm.caseHighlights.trim()}`);
  if (siteForm.ctaPrimaryText.trim()) {
    const url = siteForm.ctaPrimaryUrl.trim();
    lines.push(`文末引导：${siteForm.ctaPrimaryText.trim()}${url ? ` → ${url}` : ""}`);
  }
  if (siteForm.forbiddenTerms.trim()) {
    lines.push(`禁用词：${parseForbiddenTerms(siteForm.forbiddenTerms).join("、")}`);
  }
  return lines.join("\n");
});

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

function hasWritingProfile(site: SiteItem) {
  const profile = site.contentProfile;
  return Boolean(
    profile?.industry?.trim() ||
      profile?.certifications?.trim() ||
      profile?.moqLeadTime?.trim() ||
      profile?.ctaPrimaryText?.trim() ||
      profile?.ctaPrimaryUrl?.trim() ||
      profile?.productLines?.trim() ||
      (profile?.differentiators?.length ?? 0) > 0 ||
      profile?.targetBuyerType?.trim() ||
      profile?.caseHighlights?.trim() ||
      (profile?.forbiddenTerms?.length ?? 0) > 0
  );
}

function siteRowClassName({ row }: { row: SiteItem }) {
  return !hasWritingProfile(row) ? "site-row--profile-missing" : "";
}

function clearProfileFilter() {
  router.replace({ name: "SeoFactorySites", params: { projectId } });
}

function resetSiteForm() {
  siteForm.domain = "";
  siteForm.targetMarket = "";
  siteForm.contentLanguage = "en";
  siteForm.brandVoice = "";
  siteForm.industry = "";
  siteForm.certifications = "";
  siteForm.moqLeadTime = "";
  siteForm.ctaPrimaryText = "";
  siteForm.ctaPrimaryUrl = "";
  siteForm.utmSource = "";
  siteForm.utmMedium = "";
  siteForm.utmCampaign = "";
  siteForm.productLines = "";
  siteForm.differentiator1 = "";
  siteForm.differentiator2 = "";
  siteForm.differentiator3 = "";
  siteForm.targetBuyerType = "";
  siteForm.caseHighlights = "";
  siteForm.forbiddenTerms = "";
}

function openCreateDialog() {
  editingSiteId.value = "";
  resetSiteForm();
  siteDialogVisible.value = true;
}

function openEditDialog(site: SiteItem) {
  editingSiteId.value = site.id;
  siteForm.domain = site.domain;
  siteForm.targetMarket = site.targetMarket ?? "";
  siteForm.contentLanguage = (site.contentLanguage === "zh-CN" ? "zh-CN" : "en") as ContentLanguageCode;
  siteForm.brandVoice = site.brandVoice ?? "";
  siteForm.industry = site.contentProfile?.industry ?? "";
  siteForm.certifications = site.contentProfile?.certifications ?? "";
  siteForm.moqLeadTime = site.contentProfile?.moqLeadTime ?? "";
  siteForm.ctaPrimaryText = site.contentProfile?.ctaPrimaryText ?? "";
  siteForm.ctaPrimaryUrl = site.contentProfile?.ctaPrimaryUrl ?? "";
  siteForm.utmSource = site.contentProfile?.utmSource ?? "";
  siteForm.utmMedium = site.contentProfile?.utmMedium ?? "";
  siteForm.utmCampaign = site.contentProfile?.utmCampaign ?? "";
  siteForm.productLines = site.contentProfile?.productLines ?? "";
  siteForm.differentiator1 = site.contentProfile?.differentiators?.[0] ?? "";
  siteForm.differentiator2 = site.contentProfile?.differentiators?.[1] ?? "";
  siteForm.differentiator3 = site.contentProfile?.differentiators?.[2] ?? "";
  siteForm.targetBuyerType = site.contentProfile?.targetBuyerType ?? "";
  siteForm.caseHighlights = site.contentProfile?.caseHighlights ?? "";
  siteForm.forbiddenTerms = site.contentProfile?.forbiddenTerms?.join("，") ?? "";
  siteDialogVisible.value = true;
}

function buildSitePayload() {
  return {
    domain: siteForm.domain.trim(),
    targetMarket: siteForm.targetMarket.trim() || undefined,
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
    }
  } as Parameters<typeof createSite>[1];
}

async function submitSiteForm() {
  if (!siteFormRef.value) return;
  await siteFormRef.value.validate(async (valid) => {
    if (!valid) return;
    siteSaving.value = true;
    try {
      const payload = buildSitePayload();

      if (editingSiteId.value) {
        await updateSite(projectId, editingSiteId.value, payload);
        message("站点已更新", { type: "success" });
      } else {
        await createSite(projectId, payload);
        message("站点已创建", { type: "success" });
      }

      siteDialogVisible.value = false;
      await loadSites();
    } finally {
      siteSaving.value = false;
    }
  });
}

async function loadSites() {
  sitesLoading.value = true;
  try {
    sites.value = await listSites(projectId);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "加载站点失败";
    message(msg, { type: "error" });
  } finally {
    sitesLoading.value = false;
  }
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("zh-CN");
}

onMounted(() => {
  void loadSites();
});
</script>

<style scoped>
.site-row--profile-missing {
  --el-table-tr-bg-color: var(--el-color-warning-light-9);
}
</style>
