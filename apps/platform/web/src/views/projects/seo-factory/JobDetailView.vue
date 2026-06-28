<!--
  文章任务详情页：展示任务状态与结果，非终态时自动轮询。

  边界：
  - 不负责：工作流控制（仅展示状态）
-->
<template>
  <div v-loading="loading && !job" class="job-detail">
    <template v-if="job">
      <header class="job-detail-top">
        <div class="job-detail-top__head">
          <div class="job-detail-top__main">
            <el-button
              link
              type="primary"
              class="job-detail-top__back"
              title="返回任务列表"
              @click="goBack"
            >
              <IconifyIconOnline icon="ri:arrow-left-line" />
            </el-button>
            <div class="job-detail-top__title-wrap">
              <div class="job-detail-top__title-row">
                <h1>{{ job.targetKeyword }}</h1>
                <el-tag :type="dictTagType(jobStatusDict, job.status)" size="small">
                  {{ dictLabel(jobStatusDict, job.status) }}
                </el-tag>
                <el-tag
                  v-if="job.searchIntent"
                  size="small"
                  :type="dictTagType(keywordIntentDict, job.searchIntent)"
                >
                  {{ dictLabel(keywordIntentDict, job.searchIntent) }}
                </el-tag>
                <el-tag v-if="polling" type="info" size="small">刷新中</el-tag>
              </div>
              <div class="job-detail-top__meta">
                {{ formatTime(job.createdAt) }}
                <span v-if="job.updatedAt"> · 更新 {{ formatTime(job.updatedAt) }}</span>
              </div>
            </div>
          </div>
          <div class="job-detail-top__actions">
            <el-button
              v-if="canRetry && canWriteJob"
              type="primary"
              size="small"
              :loading="retrying"
              @click="handleRetry"
            >
              重新生成
            </el-button>
            <el-button
              v-if="job.outputUrl && !exportStale"
              type="success"
              size="small"
              :loading="exportDownloading === 'html'"
              @click="handleDownloadExport('html')"
            >
              下载 HTML
            </el-button>
            <el-button
              v-if="cmsUiEnabled && canPublishToCms && canWriteJob"
              type="success"
              size="small"
              plain
              :loading="cmsPublishing"
              @click="handlePublishToCms"
            >
              {{ cmsPublishButtonLabel }}
            </el-button>
            <el-button
              v-if="canWriteJob"
              type="danger"
              size="small"
              plain
              :loading="deleting"
              @click="handleDelete"
            >
              删除
            </el-button>
          </div>
        </div>

        <div class="job-detail-top__stats" aria-label="任务关键指标">
          <div class="job-detail-stat">
            <span class="job-detail-stat__label">本地 SEO</span>
            <strong class="job-detail-stat__value" :class="localScoreMetricClass">
              {{ localScoreDisplay }}
            </strong>
          </div>
          <div class="job-detail-stat">
            <span class="job-detail-stat__label">Semrush</span>
            <strong class="job-detail-stat__value" :class="semrushScoreMetricClass">
              {{ semrushScoreDisplay }}
            </strong>
          </div>
          <div class="job-detail-stat">
            <span class="job-detail-stat__label">内链</span>
            <strong class="job-detail-stat__value">
              {{ job.draftData?.internalLinksApplied ? internalLinkCount : "—" }}
            </strong>
          </div>
          <div class="job-detail-stat">
            <span class="job-detail-stat__label">配图</span>
            <strong class="job-detail-stat__value">
              {{ job.draftData?.imagesApplied ? articleImageCount : "—" }}
            </strong>
          </div>
        </div>
      </header>

      <section
        v-if="nextStep"
        class="job-detail-callout job-detail-callout--compact"
        :class="`job-detail-callout--${nextStep.alertType}`"
      >
        <IconifyIconOnline :icon="calloutIcon(nextStep.alertType)" class="job-detail-callout__icon" />
        <div class="job-detail-callout__body">
          <strong>{{ nextStep.title }}</strong>
          <span v-if="nextStep.description">{{ nextStep.description }}</span>
        </div>
        <el-button
          v-if="canWriteJob"
          size="small"
          :type="nextStep.buttonType"
          @click="nextStep.handler"
        >
          {{ nextStep.label }}
        </el-button>
      </section>

      <section
        v-if="gscUnderperformHint"
        class="job-detail-callout job-detail-callout--compact job-detail-callout--warning"
      >
        <IconifyIconOnline icon="ri:line-chart-line" class="job-detail-callout__icon" />
        <div class="job-detail-callout__body">
          <strong>搜索表现偏弱</strong>
          <span>展示多但点击或排名不佳，可改稿或重新优化评分。</span>
        </div>
        <div class="job-detail-callout__actions">
          <el-button
            type="primary"
            size="small"
            :loading="rerunningOptimization"
            :disabled="!canRerunOptimization"
            @click="handleRerunOptimization('gsc_underperform')"
          >
            重新优化
          </el-button>
          <el-button size="small" @click="activeTab = 'draft'">改稿</el-button>
        </div>
      </section>

      <section
        v-if="optimizingProgressMessage || isOptimizingStale"
        class="job-detail-callout job-detail-callout--compact job-detail-callout--info"
      >
        <IconifyIconOnline icon="ri:loader-4-line" class="job-detail-callout__icon" />
        <div class="job-detail-callout__body">
          <strong>进行中</strong>
          <span>
            {{ optimizingProgressMessage }}
            <template v-if="isOptimizingStale">
              · 超时无进展，请到 SEO 评分取消或重试
            </template>
          </span>
        </div>
      </section>

      <div class="job-detail-layout">
        <aside class="job-detail-sidebar">
          <div class="job-detail-panel job-detail-progress">
            <div class="job-detail-panel__head">工作流进度</div>
            <div class="job-detail-panel__body">
              <ArticleJobProgressStepper :job="job" direction="vertical" />
            </div>
          </div>

          <div class="job-detail-panel">
            <div class="job-detail-panel__head">任务概况</div>
            <div class="job-detail-panel__body">
              <ul class="job-detail-meta-list">
                <li class="job-detail-meta-list__item">
                  <span class="job-detail-meta-list__label">YMYL</span>
                  <span class="job-detail-meta-list__value">
                    <el-tag
                      v-if="ymylReviewCompleted"
                      size="small"
                      :type="requiresHumanReview ? 'warning' : 'success'"
                    >
                      {{ requiresHumanReview ? "需人工审核" : "已通过" }}
                    </el-tag>
                    <span v-else class="text-gray-500">未完成</span>
                  </span>
                </li>
                <li v-if="displayErrorMessage" class="job-detail-meta-list__item">
                  <span class="job-detail-meta-list__label">错误</span>
                  <span class="job-detail-meta-list__value text-red-500">
                    {{ displayErrorMessage }}
                    <span
                      v-if="resumeStepLabel"
                      class="mt-1 block text-sm text-gray-600"
                    >
                      将从「{{ resumeStepLabel }}」继续
                    </span>
                  </span>
                </li>
                <li v-if="requiresHumanReview" class="job-detail-meta-list__item">
                  <span class="job-detail-meta-list__label">审核说明</span>
                  <span class="job-detail-meta-list__value text-amber-700">
                    {{ ymylReviewDescription }}
                  </span>
                </li>
              </ul>
            </div>
          </div>

          <div class="job-detail-panel">
            <div class="job-detail-panel__head">导出与发布</div>
            <div class="job-detail-panel__body">
              <div v-if="exportStale" class="mb-3 text-sm text-amber-600">
                稿件已编辑，导出物已失效。
                <el-button
                  type="primary"
                  link
                  @click="handleResolveDraftStale('regenerate_export')"
                >
                  重新生成
                </el-button>
              </div>
              <div v-else-if="job.outputUrl" class="job-detail-export-actions">
                <div class="job-detail-export-actions__downloads">
                  <el-button
                    :loading="exportDownloading === 'package'"
                    @click="handleDownloadExport('package')"
                  >
                    <IconifyIconOnline icon="ri:folder-zip-line" />
                    资产包
                  </el-button>
                  <el-button
                    :loading="exportDownloading === 'html'"
                    @click="handleDownloadExport('html')"
                  >
                    <IconifyIconOnline icon="ri:file-code-line" />
                    HTML
                  </el-button>
                  <el-button
                    :loading="exportDownloading === 'jsonld'"
                    @click="handleDownloadExport('jsonld')"
                  >
                    <IconifyIconOnline icon="ri:braces-line" />
                    JSON-LD
                  </el-button>
                </div>
                <el-button
                  v-if="cmsUiEnabled && canPublishToCms"
                  type="success"
                  :loading="cmsPublishing"
                  @click="handlePublishToCms"
                >
                  <IconifyIconOnline icon="ri:send-plane-line" class="mr-1" />
                  {{ cmsPublishButtonLabel }}
                </el-button>
                <el-link
                  v-if="cmsUiEnabled && cmsPublishResult?.postUrl"
                  :href="cmsPublishResult.postUrl"
                  target="_blank"
                  type="primary"
                  class="job-detail-export-actions__link"
                >
                  查看 CMS 文章 →
                </el-link>
              </div>
              <span v-else-if="requiresHumanReview" class="text-sm text-amber-600">
                YMYL 需人工审核，未生成可发布 HTML
              </span>
              <span v-else class="text-sm text-gray-500">任务完成后可导出</span>
            </div>
          </div>

          <ArticleJobDraftPublishChecklist
            v-if="prePublishChecklistItems.length && activeTab !== 'draft'"
            variant="pre-publish"
            :items="prePublishChecklistItems"
            @action="handlePrePublishChecklistAction"
            @go-ymyl="activeTab = 'ymyl'"
            @go-edit="activeTab = 'draft'"
            @go-tab="handleChecklistGoTab"
            @go-sites="goSiteManage"
          />

          <ArticleJobDraftPublishChecklist
            v-if="publishChecklistItems.length && activeTab !== 'draft'"
            :items="publishChecklistItems"
            @action="handleChecklistAction"
            @go-ymyl="activeTab = 'ymyl'"
            @go-edit="activeTab = 'draft'"
          />

          <div class="job-detail-panel">
            <el-collapse>
              <el-collapse-item title="协作" name="collab">
                <ArticleJobCollabPanel
                  v-if="job"
                  :project-id="projectId"
                  :job-id="job.id"
                  :can-write="canWriteJob"
                />
              </el-collapse-item>
              <el-collapse-item title="高级信息" name="advanced">
                <ul class="job-detail-meta-list">
                  <li class="job-detail-meta-list__item">
                    <span class="job-detail-meta-list__label">任务 ID</span>
                    <span class="job-detail-meta-list__value text-xs">{{ job.id }}</span>
                  </li>
                  <li class="job-detail-meta-list__item">
                    <span class="job-detail-meta-list__label">Trace</span>
                    <span class="job-detail-meta-list__value text-xs">{{ job.traceId }}</span>
                  </li>
                  <li v-if="job.serpData?.fingerprint" class="job-detail-meta-list__item">
                    <span class="job-detail-meta-list__label">SERP 指纹</span>
                    <span class="job-detail-meta-list__value text-xs">
                      {{ job.serpData.fingerprint }}
                    </span>
                  </li>
                </ul>
              </el-collapse-item>
            </el-collapse>
          </div>
        </aside>

        <main class="job-detail-main">
          <div class="job-detail-tabs-panel job-detail-tabs-panel--seo">
            <el-tabs v-model="activeTab">
        <el-tab-pane label="SEO 评分" name="seo">
          <ArticleJobRewriteResult
            v-if="rewriteCandidate"
            class="mb-4"
            :candidate="rewriteCandidate"
            :accepting="rewriteAccepting"
            :discarding="rewriteDiscarding"
            @accept="handleAcceptRewrite"
            @discard="handleDiscardRewrite"
          />

          <ArticleJobSeoScorePanel
            :local-seo-score="effectiveLocalSeoScore"
            :semrush-score="job.semrushScore"
            :seo-check-data="job.seoCheckData"
            :optimize-history="job.draftData?.optimizeHistory"
            :local-pass-threshold="localPassThreshold"
            :semrush-pass-threshold="semrushPassThreshold"
            :local-align-enabled="job.siteWorkflow?.scoreCalibrationLocalAlign === true"
            :local-score-stale="draftStaleness?.affected?.localSeo"
            :semrush-score-stale="draftStaleness?.affected?.semrush"
            :can-check="hasDraftContent"
            :checking="isSemrushChecking"
            :check-stale="isOptimizingStale"
            :optimizing-message="optimizingProgressMessage"
            :can-rewrite="canTriggerRewrite"
            :rewriting="isRewriting"
            :rewrite-blocked-reason="rewriteBlockedReason"
            :can-rerun-optimization="canRerunOptimization"
            :rerunning-optimization="rerunningOptimization"
            @run-semrush-check="handleSemrushCheck"
            @cancel-semrush-check="handleCancelSemrushCheck"
            @rewrite="rewriteDrawerOpen = true"
            @rerun-optimization="handleRerunOptimization('manual')"
          />
        </el-tab-pane>
        <el-tab-pane label="稿件正文" name="draft">
          <ArticleJobDraftEditGuide />

          <ArticleJobDraftStalenessBanner
            v-if="draftStaleness && draftViewMode === 'edit'"
            :staleness="draftStaleness"
            :resolving="draftResolving"
            @resolve="handleResolveDraftStale"
            @go-review="activeTab = 'ymyl'"
          />

          <ArticleJobDraftPublishChecklist
            v-else-if="publishChecklistItems.length"
            :items="publishChecklistItems"
            @action="handleChecklistAction"
            @go-ymyl="activeTab = 'ymyl'"
          />

          <div v-if="hasDraftContent" class="mb-4">
            <el-segmented v-model="draftViewModeProxy" :options="draftViewOptions" />
          </div>

          <ArticleJobRewriteResult
            v-if="rewriteCandidate && draftViewMode === 'preview'"
            class="mb-4"
            :candidate="rewriteCandidate"
            :accepting="rewriteAccepting"
            :discarding="rewriteDiscarding"
            @accept="handleAcceptRewrite"
            @discard="handleDiscardRewrite"
          />

          <ArticleJobDraftEditor
            v-if="draftViewMode === 'edit'"
            ref="draftEditorRef"
            :project-id="projectId"
            :job-id="jobId"
            :draft-data="job.draftData"
            :brief-data="job.briefData"
            :article-images="job.draftData?.articleImages"
            :saving="draftSaving"
            :can-save="canSaveDraftEdit"
            :edit-blocked-reason="draftEditBlockedReason"
            :content-score-snapshot="job.seoCheckData?.contentScore"
            @content-scored="fetchOnce"
            @save="handleQuickSave"
            @save-preview="handleSaveAndPreview"
            @save-advanced="() => openDraftSaveDialog(false)"
            @cancel="void switchDraftViewMode('preview')"
          />

          <ArticleJobDraftPreview
            v-else
            :draft-data="job.draftData"
            :brief-data="job.briefData"
            :can-rewrite="canTriggerRewrite"
            :rewriting="isRewriting"
            :rewrite-blocked-reason="rewriteBlockedReason"
            :show-current-label="Boolean(rewriteCandidate)"
            @rewrite="rewriteDrawerOpen = true"
          />

          <ArticleJobDraftHistory
            :items="draftEditHistory"
            :rolling-back-id="draftRollingBackId"
            @rollback="handleDraftRollback"
          />

          <ArticleJobQuillbotPanel
            :quillbot="job.seoCheckData?.quillbot"
            :original-content="job.draftData?.paraphraseOriginalContent"
            :current-content="job.draftData?.content"
            :can-rerun="canRerunParaphrase"
            :rerunning="rerunningParaphrase"
            @rerun="handleRerunParaphrase"
          />
        </el-tab-pane>
        <el-tab-pane label="内容审查" name="ymyl">
          <ArticleJobYmylPanel :ymyl-review="ymylReview" />
        </el-tab-pane>
        <el-tab-pane label="内链" name="links">
          <ArticleJobInternalLinksPanel
            :project-id="projectId"
            :job-id="jobId"
            :internal-links="job.draftData?.internalLinks"
            :internal-links-applied="job.draftData?.internalLinksApplied"
            @updated="fetchOnce"
          />
        </el-tab-pane>
        <el-tab-pane label="配图" name="images">
          <ArticleJobImagesPanel
            :article-images="job.draftData?.articleImages"
            :images-applied="job.draftData?.imagesApplied"
          />
        </el-tab-pane>
        <el-tab-pane label="大纲" name="brief">
          <ArticleJobBriefReviewPanel
            v-if="briefPending"
            :project-id="projectId"
            :job-id="jobId"
            :brief-data="job.briefData"
            @updated="handleBriefUpdated"
          />
          <ArticleJobBriefPanel :brief-data="job.briefData" />
        </el-tab-pane>
        <el-tab-pane label="分析搜索结果" name="research">
          <ArticleJobCompetitorPanel
            :serp-data="job.serpData"
            :brief-data="job.briefData"
            :refreshing="serpRefreshing"
            :show-refresh-action="canRefreshSerp"
            @refresh="handleRefreshSerp"
          />
        </el-tab-pane>
            </el-tabs>
          </div>
        </main>
      </div>
    </template>

    <div v-else-if="!loading" class="job-detail-empty">
      <el-empty description="任务不存在">
        <el-button type="primary" @click="goBack">返回任务列表</el-button>
      </el-empty>
    </div>

    <ArticleJobRewriteDrawer
      v-model="rewriteDrawerOpen"
      :suggestions="rewriteSuggestions"
      :submitting="rewriteSubmitting"
      @submit="handleRewriteSubmit"
    />

    <ArticleJobDraftSaveDialog
      v-model="draftSaveDialogOpen"
      :submitting="draftSaving"
      :summary-text="draftSaveSummary"
      :affected="pendingEditAffected"
      :show-ymyl-warning="pendingYmylReReview"
      @confirm="handleConfirmDraftSave"
    />

    <ArticleJobDraftRollbackDialog
      v-model="rollbackDialogOpen"
      :entry="rollbackTarget"
      :submitting="Boolean(draftRollingBackId)"
      @confirm="submitRollback"
    />

    <ArticleJobDraftVersionConflictDialog
      v-model="versionConflictOpen"
      :submitting="draftSaving"
      @retry="handleVersionConflictRetry"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  acceptArticleRewrite,
  cancelSemrushCheck,
  discardArticleRewrite,
  deleteArticleJob,
  downloadArticleExportHtml,
  downloadArticleExportJsonLd,
  downloadArticleExportPackage,
  patchArticleDraft,
  publishArticleJob,
  resolveArticleDraftStale,
  refreshArticleJobSerp,
  rerunArticleOptimization,
  rerunArticleParaphrase,
  retryArticleJob,
  rollbackArticleDraft,
  triggerArticleRewrite,
  triggerSemrushCheck
} from "@/api/seo-factory/article-job";
import type {
  DraftResolveStaleAction,
  DraftStalenessAffected,
  ManualEditHistoryEntry,
  RewriteArticleJobPayload
} from "@/api/seo-factory/types";
import type { DraftPostSaveAction } from "@/api/seo-factory/types";
import {
  previewPendingEditAffected,
  buildPublishChecklist,
  buildPrePublishChecklist,
  prePublishChecklistAllDone,
  needsSaveConfirmDialog,
  resolveQuickSaveAction,
  type PublishChecklistAction
} from "@/utils/seo-factory/draft-edit-preview";
import { ElMessageBox } from "element-plus";
import { useArticleJobPolling } from "@/composables/seo-factory/useArticleJobPolling";
import { WORDPRESS_CMS_UI_ENABLED } from "@/constants/feature-flags";
import { message } from "@/utils/message";
import { jobStatusDict, keywordIntentDict } from "@/constants/dicts/seo-factory";
import { LOCAL_SEO_PASS_THRESHOLD, SEMRUSH_PASS_THRESHOLD } from "@/constants/seo-factory";
import { dictLabel, dictTagType } from "@/utils/dict";
import { canPublishJobToCms, cmsPublishActionLabel } from "@/utils/seo-factory/cms-publish-status";
import { useProjectSeoAccess } from "@/composables/seo-factory/useProjectSeoAccess";
import { workflowStepLabel } from "@/utils/seo-factory/workflow-progress";
import { isBriefPending } from "@/utils/seo-factory/job-progress";
import { resolveEffectiveLocalSeoScore } from "@/utils/seo-factory/local-seo-display";
import { resolveJobDisplayErrorMessage } from "@/utils/seo-factory/job-error-display";
import ArticleJobBriefPanel from "./components/ArticleJobBriefPanel.vue";
import ArticleJobCollabPanel from "./components/ArticleJobCollabPanel.vue";
import ArticleJobBriefReviewPanel from "./components/ArticleJobBriefReviewPanel.vue";
import ArticleJobProgressStepper from "./components/ArticleJobProgressStepper.vue";
import ArticleJobDraftEditor from "./components/ArticleJobDraftEditor.vue";
import ArticleJobDraftEditGuide from "./components/ArticleJobDraftEditGuide.vue";
import ArticleJobDraftHistory from "./components/ArticleJobDraftHistory.vue";
import ArticleJobDraftPreview from "./components/ArticleJobDraftPreview.vue";
import ArticleJobDraftPublishChecklist from "./components/ArticleJobDraftPublishChecklist.vue";
import ArticleJobDraftRollbackDialog from "./components/ArticleJobDraftRollbackDialog.vue";
import ArticleJobDraftSaveDialog from "./components/ArticleJobDraftSaveDialog.vue";
import ArticleJobDraftStalenessBanner from "./components/ArticleJobDraftStalenessBanner.vue";
import ArticleJobDraftVersionConflictDialog from "./components/ArticleJobDraftVersionConflictDialog.vue";
import ArticleJobImagesPanel from "./components/ArticleJobImagesPanel.vue";
import ArticleJobInternalLinksPanel from "./components/ArticleJobInternalLinksPanel.vue";
import ArticleJobRewriteDrawer from "./components/ArticleJobRewriteDrawer.vue";
import ArticleJobRewriteResult from "./components/ArticleJobRewriteResult.vue";
import ArticleJobCompetitorPanel from "./components/ArticleJobCompetitorPanel.vue";
import ArticleJobSeoScorePanel from "./components/ArticleJobSeoScorePanel.vue";
import ArticleJobQuillbotPanel from "./components/ArticleJobQuillbotPanel.vue";
import ArticleJobYmylPanel from "./components/ArticleJobYmylPanel.vue";

defineOptions({ name: "JobDetailView" });

const cmsUiEnabled = WORDPRESS_CMS_UI_ENABLED;

const route = useRoute();
const router = useRouter();
const activeTab = ref("seo");

const projectId = computed(() => route.params.projectId as string);
const jobId = computed(() => route.params.jobId as string);
const { can } = useProjectSeoAccess();
const canWriteJob = computed(() => can("seo:job:create"));

const { job, loading, polling, fetchOnce, startPolling } = useArticleJobPolling(
  projectId,
  jobId
);

const semrushChecking = ref(false);
const retrying = ref(false);
const deleting = ref(false);
const rerunningOptimization = ref(false);
const rerunningParaphrase = ref(false);
const serpRefreshing = ref(false);
const rewriteDrawerOpen = ref(false);
const rewriteSubmitting = ref(false);
const rewriteAccepting = ref(false);
const rewriteDiscarding = ref(false);
const exportDownloading = ref<"html" | "jsonld" | "package" | null>(null);
const cmsPublishing = ref(false);
const draftViewMode = ref<"preview" | "edit">("preview");
const draftViewOptions = [
  { label: "预览", value: "preview" },
  { label: "编辑", value: "edit" }
];
const draftEditorRef = ref<InstanceType<typeof ArticleJobDraftEditor> | null>(null);
const draftSaving = ref(false);
const draftSaveDialogOpen = ref(false);
const draftSaveSummary = ref("");
const pendingEditAffected = ref<DraftStalenessAffected | null>(null);
const draftRollingBackId = ref<string | null>(null);
const rollbackDialogOpen = ref(false);
const rollbackTarget = ref<ManualEditHistoryEntry | null>(null);
const draftResolving = ref<DraftResolveStaleAction | null>(null);
const versionConflictOpen = ref(false);
const pendingSaveAction = ref<DraftPostSaveAction>("refresh_local");
const pendingGoPreview = ref(false);
const draftViewModeProxy = computed({
  get: () => draftViewMode.value,
  set: (value: "preview" | "edit") => {
    void switchDraftViewMode(value);
  }
});

const hasDraftContent = computed(() => {
  const content = job.value?.draftData?.content;
  return Boolean(content && content.trim().length > 0);
});

const semrushPending = computed(() => job.value?.seoCheckData?.semrush?.pending ?? null);
const rewritePending = computed(() => job.value?.draftData?.rewritePending ?? null);
const rewriteCandidate = computed(() => job.value?.draftData?.rewriteCandidate ?? null);
const draftStaleness = computed(() => job.value?.draftData?.staleness ?? null);
const exportStale = computed(() => draftStaleness.value?.affected?.export === true);
const draftEditHistory = computed(
  () => [...(job.value?.draftData?.manualEditHistory ?? [])].reverse()
);

const draftEditBlockedReason = computed(() => {
  if (rewriteCandidate.value) return "请先采纳或放弃 AI 候选版本";
  if (isRewriting.value) return "AI 重写进行中";
  if (isSemrushChecking.value) return "Semrush 检测进行中";
  return "";
});

const canSaveDraftEdit = computed(
  () =>
    canWriteJob.value &&
    hasDraftContent.value &&
    !draftEditBlockedReason.value &&
    !draftSaving.value
);

watch(draftViewMode, (mode) => {
  if (mode === "edit" && draftEditBlockedReason.value) {
    draftViewMode.value = "preview";
    message(draftEditBlockedReason.value, { type: "warning" });
  }
});

async function switchDraftViewMode(next: "preview" | "edit") {
  if (next === draftViewMode.value) return;

  if (draftViewMode.value === "edit" && next === "preview") {
    const editor = draftEditorRef.value;
    if (editor?.isDirty) {
      try {
        await ElMessageBox.confirm("有未保存的修改，确定离开编辑模式？", "未保存修改", {
          type: "warning",
          confirmButtonText: "离开",
          cancelButtonText: "继续编辑"
        });
      } catch {
        return;
      }
    }
  }

  if (next === "edit" && draftEditBlockedReason.value) {
    message(draftEditBlockedReason.value, { type: "warning" });
    return;
  }

  draftViewMode.value = next;
}

watch(
  () => job.value?.briefData?.approvalStatus,
  (status) => {
    if (status === "pending") activeTab.value = "brief";
  },
  { immediate: true }
);

watch(
  () => route.query,
  (query) => {
    if (query.tab === "draft") activeTab.value = "draft";
    if (query.tab === "seo") activeTab.value = "seo";
    if (query.tab === "research") activeTab.value = "research";
    if (query.edit === "1" && hasDraftContent.value) draftViewMode.value = "edit";
  },
  { immediate: true }
);

const gscUnderperformHint = computed(
  () => route.query.gsc === "underperform" && job.value?.status === "COMPLETED"
);

const canRerunOptimization = computed(() => {
  if (!job.value || rerunningOptimization.value) return false;
  if (job.value.status !== "COMPLETED") return false;
  if (!hasDraftContent.value) return false;
  if (isSemrushChecking.value || isRewriting.value) return false;
  return true;
});

const canRerunParaphrase = computed(() => {
  if (!job.value || rerunningParaphrase.value) return false;
  if (job.value.status !== "COMPLETED") return false;
  if (!hasDraftContent.value) return false;
  if (isSemrushChecking.value || isRewriting.value || rerunningOptimization.value) return false;
  return true;
});

const canRefreshSerp = computed(() => {
  if (!job.value || serpRefreshing.value) return false;
  if (job.value.status === "QUEUED" || job.value.status === "RESEARCHING") return false;
  return true;
});

onMounted(() => {
  if (route.query.tab === "draft") activeTab.value = "draft";
  if (route.query.edit === "1" && hasDraftContent.value) draftViewMode.value = "edit";
});

const isSemrushChecking = computed(
  () =>
    semrushChecking.value ||
    Boolean(semrushPending.value) ||
    job.value?.status === "OPTIMIZING"
);

const isRewriting = computed(
  () => rewriteSubmitting.value || Boolean(rewritePending.value)
);

const workflowProgress = computed(
  () => job.value?.seoCheckData?.workflowProgress ?? null
);

const effectiveLocalSeoScore = computed(() => resolveEffectiveLocalSeoScore(job.value));

const localPassThreshold = computed(
  () =>
    job.value?.siteWorkflow?.localPassThreshold ??
    job.value?.seoCheckData?.scoreThresholds?.localPassThreshold ??
    LOCAL_SEO_PASS_THRESHOLD
);

const semrushPassThreshold = computed(
  () =>
    job.value?.siteWorkflow?.semrushPassThreshold ??
    job.value?.seoCheckData?.scoreThresholds?.semrushPassThreshold ??
    SEMRUSH_PASS_THRESHOLD
);

const displayErrorMessage = computed(() => resolveJobDisplayErrorMessage(job.value));

const ymylReview = computed(() => job.value?.seoCheckData?.ymylReview ?? null);

const ymylReviewCompleted = computed(() => Boolean(ymylReview.value?.reviewedAt));

const requiresHumanReview = computed(
  () => ymylReview.value?.requires_human_review === true
);

const publishChecklistItems = computed(() =>
  buildPublishChecklist({
    staleness: draftStaleness.value,
    localSeoScore: effectiveLocalSeoScore.value,
    outputUrl: job.value?.outputUrl,
    ymylReview: ymylReview.value,
    semrushRunning: isSemrushChecking.value,
    resolvingAction: draftResolving.value,
    contentScore: job.value?.seoCheckData?.contentScore,
    draftContent: job.value?.draftData?.content ?? "",
    reduceRpaEnabled: job.value?.seoCheckData?.calibration?.reduceRpaEnabled === true
  })
);

const prePublishChecklistItems = computed(() => {
  if (!job.value) return [];
  return buildPrePublishChecklist({
    job: job.value,
    siteContentProfile: job.value.siteContentProfile,
    cmsUiEnabled,
    exportStale: exportStale.value,
    resolvingAction: draftResolving.value,
    publishingCms: cmsPublishing.value
  });
});

const prePublishReady = computed(() => prePublishChecklistAllDone(prePublishChecklistItems.value));

const pendingYmylReReview = computed(() => {
  if (!requiresHumanReview.value) return false;
  if (ymylReview.value?.humanReviewStatus !== "approved") return false;
  return pendingEditAffected.value?.ymyl === true;
});

const internalLinkCount = computed(() => job.value?.draftData?.internalLinks?.length ?? 0);
const articleImageCount = computed(() => job.value?.draftData?.articleImages?.length ?? 0);

const localScoreDisplay = computed(() => {
  if (effectiveLocalSeoScore.value == null) return "—";
  return `${effectiveLocalSeoScore.value}`;
});

const semrushScoreDisplay = computed(() => {
  if (job.value?.semrushScore == null) return "—";
  return `${job.value.semrushScore}`;
});

const localScoreMetricClass = computed(() => {
  if (effectiveLocalSeoScore.value == null) return "";
  return effectiveLocalSeoScore.value >= localPassThreshold.value
    ? "job-detail-metric__value--pass"
    : "job-detail-metric__value--warn";
});

const semrushScoreMetricClass = computed(() => {
  if (job.value?.semrushScore == null) return "";
  return job.value.semrushScore >= semrushPassThreshold.value
    ? "job-detail-metric__value--pass"
    : "job-detail-metric__value--warn";
});

function calloutIcon(type: "success" | "warning" | "info" | "error") {
  const icons = {
    success: "ri:checkbox-circle-line",
    warning: "ri:alert-line",
    info: "ri:information-line",
    error: "ri:error-warning-line"
  };
  return icons[type];
}

const ymylReviewDescription = computed(() => {
  if (!requiresHumanReview.value) return "";
  const categories = ymylReview.value?.categories ?? [];
  const signals = ymylReview.value?.matchedSignals ?? [];
  const categoryText = categories.length > 0 ? categories.join("、") : "敏感主题";
  const signalPreview = signals.slice(0, 3).join("；");
  return `检测到 ${categoryText} 相关内容，禁止自动导出可发布 HTML。${signalPreview ? `命中：${signalPreview}` : ""}`;
});

const optimizingProgressMessage = computed(() => {
  if (job.value?.status === "REVIEWING") return "YMYL 内容审查中…";
  if (job.value?.status === "LINKING") return "站内内链植入中（Semrush 终检前）…";
  if (job.value?.status === "ILLUSTRATING") return "正文配图补足中（Semrush 终检前）…";
  if (job.value?.status !== "OPTIMIZING") return "";
  if (workflowProgress.value?.message) return workflowProgress.value.message;
  if (semrushPending.value) return "Semrush 终检中（手动触发，约 2–5 分钟）…";
  return "工作流优化中（本地预检 + Semrush 终检，全程约 5–20 分钟）…";
});

const isOptimizingStale = computed(() => {
  if (job.value?.status !== "OPTIMIZING") return false;

  const pendingStarted = semrushPending.value?.startedAt;
  if (pendingStarted) {
    const started = Date.parse(pendingStarted);
    if (Number.isNaN(started)) return true;
    return Date.now() - started > 5 * 60 * 1000;
  }

  const touchAt = workflowProgress.value?.updatedAt ?? job.value?.updatedAt;
  if (!touchAt) return false;
  const touched = Date.parse(touchAt);
  if (Number.isNaN(touched)) return true;
  return Date.now() - touched > 8 * 60 * 1000;
});

const rewriteSuggestions = computed(() => {
  const local = job.value?.seoCheckData?.local?.suggestions ?? [];
  const semrush = job.value?.seoCheckData?.semrush?.suggestions ?? [];
  return [...new Set([...local, ...semrush].filter(Boolean))];
});

const rewriteBlockedReason = computed(() => {
  if (rewriteCandidate.value) return "请先采纳或放弃当前 AI 候选版本";
  if (isSemrushChecking.value) return "Semrush 检测进行中，请稍后再试";
  return "";
});

const canTriggerRewrite = computed(
  () =>
    hasDraftContent.value &&
    !rewriteCandidate.value &&
    !isRewriting.value &&
    !isSemrushChecking.value
);

const canRetry = computed(
  () => canWriteJob.value && job.value?.status === "FAILED" && !retrying.value
);

const briefPending = computed(() => (job.value ? isBriefPending(job.value) : false));

interface NextStepAction {
  title: string;
  description?: string;
  label: string;
  alertType: "success" | "warning" | "info" | "error";
  buttonType: "primary" | "success" | "warning" | "danger";
  handler: () => void;
}

const nextStep = computed<NextStepAction | null>(() => {
  const j = job.value;
  if (!j) return null;

  if (briefPending.value) {
    return {
      title: "下一步：确认大纲",
      description: "核对 AI 大纲后确认，系统才会开始生成正文。",
      label: "去确认大纲",
      alertType: "warning",
      buttonType: "warning",
      handler: () => {
        activeTab.value = "brief";
      }
    };
  }

  if (j.status === "FAILED") {
    return {
      title: "下一步：重新生成",
      description: j.errorMessage || "任务生成失败，可从失败步骤继续。",
      label: "重新生成",
      alertType: "error",
      buttonType: "danger",
      handler: () => {
        void handleRetry();
      }
    };
  }

  if (requiresHumanReview.value && ymylReview.value?.humanReviewStatus !== "approved") {
    return {
      title: "下一步：敏感内容审核",
      description: "需人工审核通过后才能导出或发布。",
      label: "去审核",
      alertType: "warning",
      buttonType: "warning",
      handler: () => {
        activeTab.value = "ymyl";
      }
    };
  }

  if (exportStale.value) {
    return {
      title: "下一步：处理稿件变更",
      description: "正文已编辑，导出物已失效，请按黄色提示重新处理。",
      label: "去处理稿件",
      alertType: "warning",
      buttonType: "warning",
      handler: () => {
        activeTab.value = "draft";
      }
    };
  }

  if (cmsUiEnabled && canPublishToCms.value) {
    return {
      title: "下一步：发布到网站",
      description: "文章已就绪，可推送到 CMS。",
      label: cmsPublishButtonLabel.value,
      alertType: "success",
      buttonType: "success",
      handler: () => {
        void handlePublishToCms();
      }
    };
  }

  if (j.status === "COMPLETED" && j.outputUrl && !exportStale.value) {
    return {
      title: "下一步：下载文章",
      description: "文章已生成完成，可下载 HTML 或资产包。",
      label: "下载 HTML",
      alertType: "success",
      buttonType: "primary",
      handler: () => {
        void handleDownloadExport("html");
      }
    };
  }

  return null;
});

async function handleBriefUpdated() {
  startPolling();
  await fetchOnce();
}

const resumeStepLabel = computed(() => {
  const step = job.value?.seoCheckData?.workflow?.failedStep;
  return step ? workflowStepLabel(step) : null;
});

const cmsPublishResult = computed(() => job.value?.seoCheckData?.cmsPublish ?? null);

const canPublishToCms = computed(
  () =>
    job.value?.status === 'COMPLETED' &&
    Boolean(job.value.outputUrl) &&
    canPublishJobToCms(job.value)
);

const cmsPublishButtonLabel = computed(() =>
  job.value ? cmsPublishActionLabel(job.value) : "推送到 CMS"
);

async function handlePublishToCms() {
  if (!canPublishToCms.value || cmsPublishing.value || !job.value) return;

  cmsPublishing.value = true;
  try {
    const result = await publishArticleJob(projectId.value, jobId.value);
    const published =
      result.status === "publish" ||
      result.status === "published" ||
      (result.provider === "shopify" && result.publishedRequested);
    message(
      published ? "已发布到 CMS" : "已推送到 CMS 草稿",
      { type: "success" }
    );
    await fetchOnce();
  } catch (error) {
    const msg = error instanceof Error ? error.message : "CMS 发布失败";
    message(msg, { type: "error" });
  } finally {
    cmsPublishing.value = false;
  }
}

async function handleDownloadExport(kind: "html" | "jsonld" | "package") {
  if (!job.value?.outputUrl || exportDownloading.value) return;

  exportDownloading.value = kind;
  try {
    const blob =
      kind === "html"
        ? await downloadArticleExportHtml(projectId.value, jobId.value)
        : kind === "jsonld"
          ? await downloadArticleExportJsonLd(projectId.value, jobId.value)
          : await downloadArticleExportPackage(projectId.value, jobId.value);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const baseName = job.value.targetKeyword || "article";
    anchor.href = url;
    anchor.download =
      kind === "html"
        ? `${baseName}.html`
        : kind === "jsonld"
          ? `${baseName}.jsonld`
          : `${baseName}.zip`;
    anchor.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "导出下载失败";
    message(msg, { type: "error" });
  } finally {
    exportDownloading.value = null;
  }
}

async function handleRetry() {
  if (!canRetry.value) return;

  retrying.value = true;
  try {
    await retryArticleJob(projectId.value, jobId.value);
    message("已从失败步骤重新入队，正在重新生成…", { type: "success" });
    startPolling();
    await fetchOnce();
  } catch (error) {
    const msg = error instanceof Error ? error.message : "重试失败";
    message(msg, { type: "error" });
  } finally {
    retrying.value = false;
  }
}

async function handleDelete() {
  if (!job.value || deleting.value) return;

  const inProgress = job.value.status !== "FAILED" && job.value.status !== "COMPLETED";
  let confirmText = `确定删除任务「${job.value.targetKeyword}」？删除后不可恢复，将一并清理队列、导出文件与稿件插图。`;
  if (inProgress) {
    confirmText += "\n\n该任务仍在进行中，删除后后台可能短暂报错，可忽略。";
  }

  try {
    await ElMessageBox.confirm(confirmText, "删除任务", {
      type: "warning",
      confirmButtonText: "删除",
      cancelButtonText: "取消",
      confirmButtonClass: "el-button--danger"
    });
  } catch {
    return;
  }

  deleting.value = true;
  try {
    await deleteArticleJob(projectId.value, jobId.value);
    message("任务已删除", { type: "success" });
    goBack();
  } finally {
    deleting.value = false;
  }
}

async function handleRerunOptimization(reason: "gsc_underperform" | "manual" = "manual") {
  if (!canRerunOptimization.value) return;

  rerunningOptimization.value = true;
  try {
    await rerunArticleOptimization(projectId.value, jobId.value, { reason });
    message("已重新入队优化评分，请稍候…", { type: "success" });
    activeTab.value = "seo";
    startPolling();
    await fetchOnce();
  } catch (error) {
    const msg = error instanceof Error ? error.message : "重新优化失败";
    message(msg, { type: "error" });
  } finally {
    rerunningOptimization.value = false;
  }
}

async function handleRerunParaphrase() {
  if (!canRerunParaphrase.value) return;

  rerunningParaphrase.value = true;
  try {
    await rerunArticleParaphrase(projectId.value, jobId.value);
    message("已重新入队原创表达优化，请稍候…", { type: "success" });
    activeTab.value = "draft";
    startPolling();
    await fetchOnce();
  } catch (error) {
    const msg = error instanceof Error ? error.message : "重新润色失败";
    message(msg, { type: "error" });
  } finally {
    rerunningParaphrase.value = false;
  }
}

async function handleRefreshSerp(payload?: { serpArticlesOnly?: boolean }) {
  if (!canRefreshSerp.value) return;

  serpRefreshing.value = true;
  try {
    await refreshArticleJobSerp(projectId.value, jobId.value, payload);
    message(payload?.serpArticlesOnly === false ? "已放宽筛选并更新搜索结果" : "搜索结果已更新", {
      type: "success"
    });
    await fetchOnce();
  } catch (error) {
    const msg = error instanceof Error ? error.message : "重新分析失败";
    message(msg, { type: "error" });
  } finally {
    serpRefreshing.value = false;
  }
}

async function handleSemrushCheck() {
  if (!hasDraftContent.value || isSemrushChecking.value) return;

  semrushChecking.value = true;
  try {
    await triggerSemrushCheck(projectId.value, jobId.value);
    message("Semrush 检测已启动，请稍候…", { type: "success" });
    startPolling();
    await fetchOnce();
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Semrush 检测启动失败";
    message(msg, { type: "error" });
  } finally {
    semrushChecking.value = false;
  }
}

async function handleCancelSemrushCheck() {
  if (!isSemrushChecking.value) return;

  try {
    await cancelSemrushCheck(projectId.value, jobId.value);
    message("Semrush 检测已取消", { type: "success" });
    await fetchOnce();
  } catch (error) {
    const msg = error instanceof Error ? error.message : "取消失败";
    message(msg, { type: "error" });
  }
}

async function handleRewriteSubmit(payload: RewriteArticleJobPayload) {
  if (!canTriggerRewrite.value) return;

  rewriteSubmitting.value = true;
  try {
    await triggerArticleRewrite(projectId.value, jobId.value, payload);
    rewriteDrawerOpen.value = false;
    message("AI 重写已启动，请稍候…", { type: "success" });
    startPolling();
    await fetchOnce();
  } catch (error) {
    const msg = error instanceof Error ? error.message : "AI 重写启动失败";
    message(msg, { type: "error" });
  } finally {
    rewriteSubmitting.value = false;
  }
}

async function handleAcceptRewrite() {
  if (!rewriteCandidate.value || rewriteAccepting.value) return;

  rewriteAccepting.value = true;
  try {
    const result = await acceptArticleRewrite(projectId.value, jobId.value);
    activeTab.value = "seo";
    if (result.status === "OPTIMIZING") {
      message("已采纳新版本，正在重新评分（本地 + Semrush）…", { type: "success" });
      startPolling();
    } else {
      message("已采纳新版本，本地 SEO 分已刷新", { type: "success" });
    }
    await fetchOnce();
  } catch (error) {
    const msg = error instanceof Error ? error.message : "采纳失败";
    message(msg, { type: "error" });
  } finally {
    rewriteAccepting.value = false;
  }
}

async function handleDiscardRewrite() {
  if (!rewriteCandidate.value || rewriteDiscarding.value) return;

  rewriteDiscarding.value = true;
  try {
    await discardArticleRewrite(projectId.value, jobId.value);
    message("已放弃 AI 候选版本", { type: "success" });
    await fetchOnce();
  } catch (error) {
    const msg = error instanceof Error ? error.message : "放弃失败";
    message(msg, { type: "error" });
  } finally {
    rewriteDiscarding.value = false;
  }
}

async function handleResolveDraftStale(action: DraftResolveStaleAction) {
  if (draftResolving.value) return;

  draftResolving.value = action;
  try {
    await resolveArticleDraftStale(projectId.value, jobId.value, action);
    const labels: Record<DraftResolveStaleAction, string> = {
      refresh_local: "本地 SEO 已重算",
      rerun_semrush: "Semrush 终检已启动",
      regenerate_export: "导出物已重新生成"
    };
    message(labels[action], { type: "success" });
    if (action === "rerun_semrush") startPolling();
    await fetchOnce();
  } catch (error) {
    const msg = error instanceof Error ? error.message : "操作失败";
    message(msg, { type: "error" });
  } finally {
    draftResolving.value = null;
  }
}

function handleChecklistAction(action: DraftResolveStaleAction) {
  void handleResolveDraftStale(action);
}

function handlePrePublishChecklistAction(
  action: Exclude<
    PublishChecklistAction,
    "go_ymyl" | "go_edit" | "go_internal_links" | "go_images" | "go_sites"
  >
) {
  if (action === "publish_cms") {
    void handlePublishToCms();
    return;
  }
  if (action === "regenerate_export") {
    void handleResolveDraftStale("regenerate_export");
    return;
  }
  void handleResolveDraftStale(action as DraftResolveStaleAction);
}

function handleChecklistGoTab(tab: "internalLinks" | "images") {
  activeTab.value = tab === "internalLinks" ? "links" : "images";
}

function goSiteManage() {
  router.push({ name: "SeoFactorySites", params: { projectId: projectId.value } });
}

function extractApiErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const response = (error as { response?: { data?: { error?: { code?: string } } } }).response;
  return response?.data?.error?.code;
}

function openDraftSaveDialog(goPreview = false) {
  pendingGoPreview.value = goPreview;
  const editor = draftEditorRef.value;
  if (!editor || !job.value?.draftData) return;

  const payload = editor.getPayload();
  const before = job.value.draftData;
  const affected = previewPendingEditAffected(before, payload);
  if (!affected) {
    message("内容无变更", { type: "warning" });
    return;
  }

  const parts: string[] = [];
  if (affected.export) parts.push("导出物");
  if (affected.localSeo) parts.push("本地 SEO 分");
  draftSaveSummary.value = `将保存对${parts.length ? parts.join("、") : "稿件"}的修改。`;
  pendingEditAffected.value = affected;
  draftSaveDialogOpen.value = true;
}

function handleQuickSave() {
  void runDraftSave({ goPreview: false, forceDialog: false });
}

function handleSaveAndPreview() {
  void runDraftSave({ goPreview: true, forceDialog: false });
}

async function runDraftSave(options: { goPreview: boolean; forceDialog: boolean }) {
  const editor = draftEditorRef.value;
  if (!editor || !job.value?.draftData) return;

  const payload = editor.getPayload();
  const before = job.value.draftData;
  const affected = previewPendingEditAffected(before, payload);
  if (!affected) {
    message("内容无变更", { type: "warning" });
    return;
  }

  const ymylWasApproved = ymylReview.value?.humanReviewStatus === "approved";
  if (
    options.forceDialog ||
    needsSaveConfirmDialog(before, payload, { ymylWasApproved })
  ) {
    pendingGoPreview.value = options.goPreview;
    openDraftSaveDialog();
    return;
  }

  await submitDraftSave(resolveQuickSaveAction(affected), { goPreview: options.goPreview });
}

async function submitDraftSave(
  postSaveAction: DraftPostSaveAction,
  options?: { goPreview?: boolean }
) {
  const editor = draftEditorRef.value;
  if (!editor || !job.value?.draftData || draftSaving.value) return;

  const payload = editor.getPayload();
  draftSaving.value = true;
  try {
    await patchArticleDraft(projectId.value, jobId.value, {
      ...payload,
      contentVersion: job.value.draftData.contentVersion ?? 0,
      postSaveAction
    });
    draftSaveDialogOpen.value = false;
    editor.markSaved();
    if (options?.goPreview) {
      await switchDraftViewMode("preview");
    }
    message(
      postSaveAction === "rerun_from_optimizing"
        ? "已保存，正在重算 SEO / Semrush…"
        : postSaveAction === "refresh_local"
          ? "已保存，正在重算本地 SEO…"
          : "稿件已保存",
      { type: "success" }
    );
    if (postSaveAction === "rerun_from_optimizing") startPolling();
    await fetchOnce();
  } catch (error) {
    if (extractApiErrorCode(error) === "DRAFT_VERSION_CONFLICT") {
      pendingSaveAction.value = postSaveAction;
      pendingGoPreview.value = options?.goPreview ?? false;
      versionConflictOpen.value = true;
      return;
    }
    const msg = error instanceof Error ? error.message : "保存失败";
    message(msg, { type: "error" });
  } finally {
    draftSaving.value = false;
  }
}

async function handleVersionConflictRetry() {
  versionConflictOpen.value = false;
  await fetchOnce();
  await submitDraftSave(pendingSaveAction.value, { goPreview: pendingGoPreview.value });
}

async function handleConfirmDraftSave(postSaveAction: DraftPostSaveAction) {
  pendingSaveAction.value = postSaveAction;
  await submitDraftSave(postSaveAction, { goPreview: pendingGoPreview.value });
}

function handleDraftRollback(historyId: string) {
  if (draftRollingBackId.value || draftSaving.value) return;

  const entry = job.value?.draftData?.manualEditHistory?.find((item) => item.id === historyId);
  if (!entry) return;

  rollbackTarget.value = entry;
  rollbackDialogOpen.value = true;
}

async function submitRollback() {
  if (!rollbackTarget.value || draftRollingBackId.value) return;

  const historyId = rollbackTarget.value.id;
  draftRollingBackId.value = historyId;
  try {
    await rollbackArticleDraft(projectId.value, jobId.value, historyId, "refresh_local");
    rollbackDialogOpen.value = false;
    rollbackTarget.value = null;
    message("已回滚至历史版本", { type: "success" });
    await switchDraftViewMode("preview");
    await fetchOnce();
  } catch (error) {
    const msg = error instanceof Error ? error.message : "回滚失败";
    message(msg, { type: "error" });
  } finally {
    draftRollingBackId.value = null;
  }
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("zh-CN");
}

function goBack() {
  router.push({ name: "SeoFactoryJobs", params: { projectId: projectId.value } });
}
</script>
