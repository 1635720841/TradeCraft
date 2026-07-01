<!--
  项目配置：企业运营向流程开关（按站点）。

  边界：
  - 不负责：评分门槛、校准与 SERP 高级参数（Console 项目诊断）
  - 不负责：站点素材、CMS、页面库（SiteDetailView）
-->
<template>
  <div class="p-4 space-y-4">
    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="项目配置说明"
      description="此处配置大纲确认、表达润色、自动配图与自动生产等运营开关。评分门槛与 SERP 高级参数由平台运营在「项目诊断」中配置。"
    />

    <el-card v-if="sites.length > 0 || sitesLoading" shadow="never" class="border-none! shadow-none!">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="text-sm text-gray-600">当前配置站点</span>
        <SiteSettingsToolbar
          v-model:site-id="selectedSiteId"
          :sites="sites"
          :sites-loading="sitesLoading"
          :can-manage="canManageSite"
          :saving="saving"
          @site-change="onSiteChange"
          @save="submitAdminForm"
        />
      </div>
    </el-card>

    <el-card shadow="never">
      <template #header>
        <span class="font-medium">流程开关</span>
      </template>

      <el-empty v-if="!sitesLoading && sites.length === 0" description="请先在「站点」创建站点" />

      <el-alert
        v-else-if="!canManageSite"
        type="info"
        :closable="false"
        show-icon
        title="您仅有查看权限，无法修改项目配置"
      />

      <el-form v-else :model="adminForm" label-width="120px" :disabled="!canManageSite">
        <el-form-item label="大纲需确认">
          <el-switch v-model="adminForm.requireBriefApproval" />
          <p class="mt-1 text-xs text-gray-500">
            开启后，大纲生成完成需人工确认再进入初稿，适合 B2B 方向把控。
          </p>
        </el-form-item>

        <el-form-item label="表达润色">
          <el-switch v-model="adminForm.enableParaphrase" />
          <p class="mt-1 text-xs text-gray-500">
            Semrush 优化后轻量优化模板化句式，保持关键词与结构。术语敏感站点可关闭。
          </p>
        </el-form-item>

        <el-form-item label="自动配图">
          <el-switch v-model="adminForm.enableIllustration" />
          <p class="mt-1 text-xs text-gray-500">
            内链完成后通过 BFL 自动生成文章配图。关闭后正文不含插图，可节省配图配额。
          </p>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <template #header>
        <div>
          <span class="font-medium">自动生产</span>
          <p class="mt-1 text-xs text-gray-500">
            按计划在词库或搜索表现中自动选词并入队生成；在设定时刻触发，不是每小时都写。
          </p>
        </div>
      </template>

      <el-empty v-if="!sitesLoading && sites.length === 0" description="请先在「站点」创建站点" />

      <template v-else-if="canManageSite">
        <el-form :model="autopilotForm" label-width="120px" :disabled="!canManageSite">
          <el-form-item label="开启自动生产">
            <el-switch v-model="autopilotForm.enabled" />
            <p class="mt-1 text-xs text-gray-500">
              开启后系统将在计划时间自动选词并创建写作任务，无需手动从词库入队。
            </p>
          </el-form-item>

          <template v-if="autopilotForm.enabled">
            <el-form-item label="发布计划">
              <el-select
                v-model="autopilotForm.schedulePreset"
                style="width: 280px"
                @change="onSchedulePresetChange"
              >
                <el-option
                  v-for="option in schedulePresetOptions"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value"
                >
                  <div class="flex flex-col">
                    <span>{{ option.label }}</span>
                    <span class="text-xs text-gray-400">{{ option.hint }}</span>
                  </div>
                </el-option>
              </el-select>
              <p class="mt-1 text-xs text-gray-500">{{ scheduleSummary }}</p>
            </el-form-item>

            <el-form-item label="运行时刻">
              <el-select v-model="autopilotForm.runHourBeijing" style="width: 140px">
                <el-option
                  v-for="hour in beijingHourOptions"
                  :key="hour"
                  :label="`${String(hour).padStart(2, '0')}:00`"
                  :value="hour"
                />
              </el-select>
              <p class="mt-1 text-xs text-gray-500">北京时间整点触发，每天仅在此时入队一次。</p>
            </el-form-item>

            <template v-if="autopilotForm.schedulePreset === 'custom'">
              <el-form-item label="运行星期">
                <el-checkbox-group v-model="autopilotForm.runDaysOfWeek">
                  <el-checkbox
                    v-for="day in weekdayOptions"
                    :key="day.value"
                    :label="day.value"
                  >
                    {{ day.label }}
                  </el-checkbox>
                </el-checkbox-group>
              </el-form-item>

              <el-form-item label="每次入队篇数">
                <el-input-number v-model="autopilotForm.articlesPerRun" :min="1" :max="10" />
              </el-form-item>
            </template>

            <el-form-item label="关键词来源">
              <el-select v-model="autopilotForm.keywordSource" style="width: 260px">
                <el-option label="词库高优先级" value="priority_pool" />
                <el-option label="Google 搜索机会词" value="gsc_opportunity" />
                <el-option label="词库优先，不足补 GSC" value="both" />
              </el-select>
            </el-form-item>

            <el-form-item label="生成后操作">
              <el-select v-model="autopilotForm.publishMode" style="width: 260px">
                <el-option label="仅生成，不推送 CMS" value="none" />
                <el-option label="推送 CMS 草稿" value="draft" />
                <el-option label="直接发布到 CMS" value="publish" />
              </el-select>
              <p class="mt-1 text-xs text-gray-500">
                推送前需在「站点」配置 WordPress 或 Shopify；敏感内容仍会等待人工审核。
              </p>
            </el-form-item>

            <el-alert
              v-if="adminForm.requireBriefApproval"
              class="mt-2"
              type="warning"
              :closable="false"
              show-icon
              title="已同时开启「大纲需确认」"
              description="自动入队的文章在大纲阶段仍会暂停，需人工确认后再继续生成。"
            />

            <el-alert
              v-if="publishNeedsCms && !selectedSiteHasCms"
              class="mt-2"
              type="warning"
              :closable="false"
              show-icon
              title="尚未配置 CMS"
              description="请先在「站点」详情中配置 WordPress 或 Shopify，否则无法自动推送。"
            />
          </template>
        </el-form>
      </template>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { listSites, updateSite } from "@/api/seo-factory/site";
import type {
  AutopilotKeywordSource,
  AutopilotPublishMode,
  SiteAutopilotSettings,
  SiteItem
} from "@/api/seo-factory/types";
import { message } from "@/utils/message";
import { useProjectSeoAccess } from "@/composables/seo-factory/useProjectSeoAccess";
import SiteSettingsToolbar from "./components/SiteSettingsToolbar.vue";
import {
  AUTOPILOT_BEIJING_HOUR_OPTIONS,
  AUTOPILOT_SCHEDULE_PRESET_OPTIONS,
  applyAutopilotSchedulePreset,
  beijingHourToUtcHour,
  describeAutopilotSchedule,
  inferAutopilotSchedulePreset,
  utcHourToBeijingHour,
  type AutopilotSchedulePreset
} from "@/utils/seo-factory/autopilot-schedule";

defineOptions({ name: "ProjectSettingsView" });

const route = useRoute();
const router = useRouter();
const projectId = route.params.projectId as string;
const { can } = useProjectSeoAccess();
const canManageSite = computed(() => can("seo:site:manage"));

const sitesLoading = ref(false);
const saving = ref(false);
const sites = ref<SiteItem[]>([]);
const selectedSiteId = ref("");

const schedulePresetOptions = AUTOPILOT_SCHEDULE_PRESET_OPTIONS;
const beijingHourOptions = AUTOPILOT_BEIJING_HOUR_OPTIONS;

const weekdayOptions = [
  { value: 1, label: "周一" },
  { value: 2, label: "周二" },
  { value: 3, label: "周三" },
  { value: 4, label: "周四" },
  { value: 5, label: "周五" },
  { value: 6, label: "周六" },
  { value: 0, label: "周日" }
] as const;

const adminForm = reactive({
  requireBriefApproval: false,
  enableParaphrase: true,
  enableIllustration: true
});

const autopilotForm = reactive({
  enabled: false,
  schedulePreset: "daily_1" as AutopilotSchedulePreset,
  articlesPerRun: 1,
  keywordSource: "priority_pool" as AutopilotKeywordSource,
  publishMode: "none" as AutopilotPublishMode,
  runDaysOfWeek: [0, 1, 2, 3, 4, 5, 6] as number[],
  runHourBeijing: 9
});

const scheduleSummary = computed(() =>
  describeAutopilotSchedule({
    runDaysOfWeek: autopilotForm.runDaysOfWeek,
    articlesPerRun: autopilotForm.articlesPerRun,
    runHourUtc: beijingHourToUtcHour(autopilotForm.runHourBeijing)
  })
);

const selectedSite = computed(
  () => sites.value.find((site) => site.id === selectedSiteId.value) ?? null
);

const selectedSiteHasCms = computed(() => Boolean(selectedSite.value?.cmsType));

const publishNeedsCms = computed(
  () => autopilotForm.publishMode === "draft" || autopilotForm.publishMode === "publish"
);

function resetAdminForm() {
  adminForm.requireBriefApproval = false;
  adminForm.enableParaphrase = true;
  adminForm.enableIllustration = true;
}

function resetAutopilotForm() {
  autopilotForm.enabled = false;
  autopilotForm.schedulePreset = "daily_1";
  autopilotForm.articlesPerRun = 1;
  autopilotForm.keywordSource = "priority_pool";
  autopilotForm.publishMode = "none";
  autopilotForm.runDaysOfWeek = [0, 1, 2, 3, 4, 5, 6];
  autopilotForm.runHourBeijing = 9;
}

function onSchedulePresetChange(preset: AutopilotSchedulePreset) {
  const applied = applyAutopilotSchedulePreset(preset);
  autopilotForm.runDaysOfWeek = [...applied.runDaysOfWeek];
  autopilotForm.articlesPerRun = applied.articlesPerRun;
}

function loadAutopilotFromSite(settings?: SiteAutopilotSettings | null) {
  resetAutopilotForm();
  if (!settings) return;

  autopilotForm.enabled = settings.enabled === true;
  autopilotForm.articlesPerRun = settings.articlesPerRun ?? 1;
  autopilotForm.keywordSource = settings.keywordSource ?? "priority_pool";
  autopilotForm.publishMode = settings.publishMode ?? "none";
  autopilotForm.runDaysOfWeek =
    settings.runDaysOfWeek && settings.runDaysOfWeek.length > 0
      ? [...settings.runDaysOfWeek]
      : [0, 1, 2, 3, 4, 5, 6];
  autopilotForm.runHourBeijing = utcHourToBeijingHour(settings.runHourUtc ?? 1);
  autopilotForm.schedulePreset = inferAutopilotSchedulePreset(
    autopilotForm.runDaysOfWeek,
    autopilotForm.articlesPerRun
  );
}

function loadAdminFormFromSite(site: SiteItem) {
  resetAdminForm();
  adminForm.requireBriefApproval = site.workflow?.requireBriefApproval ?? false;
  adminForm.enableParaphrase = site.workflow?.enableParaphrase !== false;
  adminForm.enableIllustration = site.workflow?.enableIllustration !== false;
  loadAutopilotFromSite(site.autopilot);
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

function buildSitePayload() {
  return {
    workflow: {
      requireBriefApproval: adminForm.requireBriefApproval,
      enableParaphrase: adminForm.enableParaphrase,
      enableIllustration: adminForm.enableIllustration
    },
    autopilot: {
      enabled: autopilotForm.enabled,
      articlesPerRun: autopilotForm.articlesPerRun,
      keywordSource: autopilotForm.keywordSource,
      publishMode: autopilotForm.publishMode,
      runDaysOfWeek: [...autopilotForm.runDaysOfWeek].sort((a, b) => a - b),
      runHourUtc: beijingHourToUtcHour(autopilotForm.runHourBeijing)
    }
  } satisfies Parameters<typeof updateSite>[2];
}

async function submitAdminForm() {
  if (!selectedSiteId.value) return;

  if (publishNeedsCms.value && !selectedSiteHasCms.value && autopilotForm.enabled) {
    message("自动推送前请先在站点中配置 WordPress 或 Shopify", { type: "warning" });
    return;
  }

  if (autopilotForm.enabled && autopilotForm.schedulePreset === "custom" && autopilotForm.runDaysOfWeek.length === 0) {
    message("请至少选择一个运行星期", { type: "warning" });
    return;
  }

  saving.value = true;
  try {
    await updateSite(projectId, selectedSiteId.value, buildSitePayload());
    message("项目配置已保存", { type: "success" });
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

watch(
  () => route.query.siteId,
  () => {
    syncSelectedSiteFromRoute();
    const site = selectedSite.value;
    if (site) loadAdminFormFromSite(site);
  }
);

onMounted(() => {
  void loadSites();
});
</script>
