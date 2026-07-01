<!--
  文章任务详情页：展示任务状态与结果，非终态时自动轮询。

  边界：
  - 不负责：工作流控制（仅展示状态）
-->
<template>
  <div v-loading="loading && !job" class="job-detail">
    <template v-if="job">
      <JobDetailHeader
        :job="job"
        :polling="polling"
        :can-retry="canRetry"
        :can-pause="canPause"
        :can-resume="canResume"
        :can-write-job="canWriteJob"
        :pausing="pausing"
        :resuming="resuming"
        :retrying="retrying"
        :export-stale="exportStale"
        :export-downloading="exportDownloading"
        :cms-ui-enabled="cmsUiEnabled"
        :can-publish-to-cms="canPublishToCms"
        :can-publish-job="canPublishJob"
        :cms-publishing="cmsPublishing"
        :cms-publish-button-label="cmsPublishButtonLabel"
        :deleting="deleting"
        @back="goBack"
        @pause="handlePause"
        @resume="handleResume"
        @retry="handleRetry"
        @download-export="handleDownloadExport"
        @publish-cms="handlePublishToCms"
        @delete-job="handleDelete"
        @go-diagnose="goDetailTab('diagnose')"
        @go-section="goDetailTab('diagnose', $event)"
        @print-report="creationReportOpen = true"
      />

      <section
        v-if="nextStep"
        class="job-detail-callout job-detail-callout--compact"
        :class="`job-detail-callout--${nextStep.alertType}`"
      >
        <IconifyIconOnline
          :icon="calloutIcon(nextStep.alertType)"
          class="job-detail-callout__icon"
        />
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
        <IconifyIconOnline
          icon="ri:line-chart-line"
          class="job-detail-callout__icon"
        />
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
          <el-button size="small" @click="goDetailTab('article')"
            >改稿</el-button
          >
        </div>
      </section>

      <section
        v-if="optimizingProgressMessage || isOptimizingStale"
        class="job-detail-callout job-detail-callout--compact job-detail-callout--info"
      >
        <IconifyIconOnline
          icon="ri:loader-4-line"
          class="job-detail-callout__icon"
        />
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
        <ArticleJobDetailSidebar
          v-if="job"
          :job="job"
          :activity-items="activityItems"
          :project-id="projectId"
          :can-write-job="canWriteJob"
          :cms-ui-enabled="cmsUiEnabled"
          :export-stale="exportStale"
          :export-downloading="exportDownloading"
          :cms-publishing="cmsPublishing"
          :can-publish-to-cms="canPublishToCms"
          :cms-publish-button-label="cmsPublishButtonLabel"
          :cms-publish-result="cmsPublishResult"
          :requires-human-review="requiresHumanReview"
          :pre-publish-checklist-items="prePublishChecklistItems"
          :publish-checklist-items="publishChecklistItems"
          :active-tab="activeTab"
          @resolve-draft-stale="handleResolveDraftStale('regenerate_export')"
          @download-export="handleDownloadExport"
          @publish-cms="handlePublishToCms"
          @pre-publish-action="handlePrePublishChecklistAction"
          @checklist-action="handleChecklistAction"
          @go-tab="goDetailTab"
          @checklist-go-tab="handleChecklistGoTab"
          @go-sites="goSiteManage"
        />

        <main class="job-detail-main">
          <div class="job-detail-tabs-panel job-detail-tabs-panel--seo">
            <el-tabs v-model="activeTab">
              <el-tab-pane label="文章" name="article">
                <ArticleJobDraftEditGuide />

                <ArticleJobDraftStalenessBanner
                  v-if="draftStaleness && draftViewMode === 'edit'"
                  :staleness="draftStaleness"
                  :resolving="draftResolving"
                  @resolve="handleResolveDraftStale"
                  @go-review="goDetailTab('diagnose', 'ymyl')"
                />

                <ArticleJobDraftPublishChecklist
                  v-else-if="publishChecklistItems.length"
                  :items="publishChecklistItems"
                  @action="handleChecklistAction"
                  @go-ymyl="goDetailTab('diagnose', 'ymyl')"
                />

                <div v-if="hasDraftContent" class="mb-4">
                  <el-segmented
                    v-model="draftViewModeProxy"
                    :options="draftViewOptions"
                  />
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
                  :site-domain="job.siteDomain"
                  :target-keyword="job.targetKeyword"
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
              <el-tab-pane label="优化诊断" name="diagnose" lazy>
                <ArticleJobDiagnosePanel
                  ref="diagnosePanelRef"
                  :job="job"
                  :project-id="projectId"
                  :job-id="jobId"
                  :local-seo-score="effectiveLocalSeoScore"
                  :local-pass-threshold="localPassThreshold"
                  :semrush-pass-threshold="semrushPassThreshold"
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
                  :serp-refreshing="serpRefreshing"
                  :can-refresh-serp="canRefreshSerp"
                  :rewrite-candidate="rewriteCandidate"
                  :rewrite-accepting="rewriteAccepting"
                  :rewrite-discarding="rewriteDiscarding"
                  :ymyl-review="ymylReview"
                  @updated="fetchOnce"
                  @run-semrush-check="handleSemrushCheck"
                  @cancel-semrush-check="handleCancelSemrushCheck"
                  @rewrite="rewriteDrawerOpen = true"
                  @rerun-optimization="handleRerunOptimization('manual')"
                  @refresh-serp="handleRefreshSerp"
                  @accept-rewrite="handleAcceptRewrite"
                  @discard-rewrite="handleDiscardRewrite"
                />
              </el-tab-pane>
              <el-tab-pane label="大纲" name="brief" lazy>
                <ArticleJobBriefReviewPanel
                  v-if="briefPending"
                  :project-id="projectId"
                  :job-id="jobId"
                  :brief-data="job.briefData"
                  @updated="handleBriefUpdated"
                />
                <ArticleJobBriefPanel :brief-data="job.briefData" />
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

    <ArticleJobCreationReport
      v-if="job"
      v-model="creationReportOpen"
      :job="job"
    />

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
import { computed, ref } from "vue";
import {
  acceptArticleRewrite,
  cancelSemrushCheck,
  discardArticleRewrite,
  deleteArticleJob,
  pauseArticleJob,
  refreshArticleJobSerp,
  rerunArticleOptimization,
  rerunArticleParaphrase,
  resumeArticleJob,
  retryArticleJob,
  triggerArticleRewrite,
  triggerSemrushCheck
} from "@/api/seo-factory/article-job";
import type {
  DraftResolveStaleAction,
  RewriteArticleJobPayload
} from "@/api/seo-factory/types";
import {
  buildPrePublishChecklist,
  prePublishChecklistAllDone,
  type PublishChecklistAction
} from "@/utils/seo-factory/draft-edit-preview";
import { ElMessageBox } from "element-plus";
import { useJobNextStep } from "@/composables/seo-factory/useJobNextStep";
import { useJobExportActions } from "@/composables/seo-factory/useJobExportActions";
import { useJobDetail } from "@/composables/seo-factory/useJobDetail";
import { useJobDraftActions } from "@/composables/seo-factory/useJobDraftActions";
import { WORDPRESS_CMS_UI_ENABLED } from "@/constants/feature-flags";
import { message } from "@/utils/message";
import { PARAPHRASE_RERUN_FAILED, PARAPHRASE_RERUN_QUEUED } from "@wm/shared-core";
import type { DiagnoseSection } from "@/utils/seo-factory/job-detail-summary";
import ArticleJobDetailSidebar from "./components/ArticleJobDetailSidebar.vue";
import ArticleJobBriefPanel from "./components/ArticleJobBriefPanel.vue";
import ArticleJobBriefReviewPanel from "./components/ArticleJobBriefReviewPanel.vue";
import ArticleJobCreationReport from "./components/ArticleJobCreationReport.vue";
import ArticleJobDiagnosePanel from "./components/ArticleJobDiagnosePanel.vue";
import ArticleJobDraftEditor from "./components/ArticleJobDraftEditor.vue";
import ArticleJobDraftEditGuide from "./components/ArticleJobDraftEditGuide.vue";
import ArticleJobDraftHistory from "./components/ArticleJobDraftHistory.vue";
import ArticleJobDraftPreview from "./components/ArticleJobDraftPreview.vue";
import ArticleJobDraftPublishChecklist from "./components/ArticleJobDraftPublishChecklist.vue";
import ArticleJobDraftRollbackDialog from "./components/ArticleJobDraftRollbackDialog.vue";
import ArticleJobDraftSaveDialog from "./components/ArticleJobDraftSaveDialog.vue";
import ArticleJobDraftStalenessBanner from "./components/ArticleJobDraftStalenessBanner.vue";
import ArticleJobDraftVersionConflictDialog from "./components/ArticleJobDraftVersionConflictDialog.vue";
import JobDetailHeader from "./components/JobDetailHeader.vue";
import ArticleJobRewriteDrawer from "./components/ArticleJobRewriteDrawer.vue";
import ArticleJobRewriteResult from "./components/ArticleJobRewriteResult.vue";
import ArticleJobQuillbotPanel from "./components/ArticleJobQuillbotPanel.vue";

defineOptions({ name: "JobDetailView" });

const cmsUiEnabled = WORDPRESS_CMS_UI_ENABLED;
const creationReportOpen = ref(false);
const retrying = ref(false);
const pausing = ref(false);
const resuming = ref(false);
const deleting = ref(false);
const rerunningOptimization = ref(false);
const rerunningParaphrase = ref(false);
const serpRefreshing = ref(false);
const rewriteDrawerOpen = ref(false);
const rewriteSubmitting = ref(false);
const rewriteAccepting = ref(false);
const rewriteDiscarding = ref(false);

const {
  route,
  projectId,
  jobId,
  canWriteJob,
  canPublishJob,
  job,
  loading,
  polling,
  fetchOnce,
  startPolling,
  activeTab,
  diagnosePanelRef,
  goDetailTab,
  activityItems,
  semrushChecking,
  hasDraftContent,
  rewriteCandidate,
  draftStaleness,
  exportStale,
  draftEditHistory,
  isSemrushChecking,
  isRewriting,
  effectiveLocalSeoScore,
  localPassThreshold,
  semrushPassThreshold,
  ymylReview,
  requiresHumanReview,
  gscUnderperformHint,
  canRerunOptimization,
  canRerunParaphrase,
  canRefreshSerp,
  optimizingProgressMessage,
  isOptimizingStale,
  rewriteSuggestions,
  rewriteBlockedReason,
  canTriggerRewrite,
  canRetry,
  canPause,
  canResume,
  briefPending,
  calloutIcon,
  goBack,
  goSiteManage,
  handleChecklistGoTab
} = useJobDetail({
  isRewriting: rewriteSubmitting,
  rerunningOptimization,
  rerunningParaphrase,
  serpRefreshing,
  retrying
});

const {
  draftViewMode,
  draftViewOptions,
  draftViewModeProxy,
  draftEditorRef,
  draftSaving,
  draftSaveDialogOpen,
  draftSaveSummary,
  pendingEditAffected,
  draftRollingBackId,
  rollbackDialogOpen,
  rollbackTarget,
  draftResolving,
  versionConflictOpen,
  draftEditBlockedReason,
  canSaveDraftEdit,
  publishChecklistItems,
  pendingYmylReReview,
  switchDraftViewMode,
  openDraftSaveDialog,
  handleQuickSave,
  handleSaveAndPreview,
  handleVersionConflictRetry,
  handleConfirmDraftSave,
  handleResolveDraftStale,
  handleChecklistAction,
  handleDraftRollback,
  submitRollback
} = useJobDraftActions({
  route,
  projectId,
  jobId,
  job,
  fetchOnce,
  startPolling,
  hasDraftContent,
  ymylReview,
  requiresHumanReview,
  canWriteJob,
  rewriteCandidate,
  isRewriting,
  isSemrushChecking,
  draftStaleness,
  effectiveLocalSeoScore
});

const {
  exportDownloading,
  cmsPublishing,
  cmsPublishResult,
  canPublishToCms,
  cmsPublishButtonLabel,
  handlePublishToCms,
  handleDownloadExport
} = useJobExportActions({
  projectId,
  jobId,
  job,
  exportStale,
  onPublished: fetchOnce
});

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

const prePublishReady = computed(() =>
  prePublishChecklistAllDone(prePublishChecklistItems.value)
);

const nextStep = useJobNextStep({
  job,
  briefPending,
  exportStale,
  requiresHumanReview,
  ymylHumanReviewStatus: computed(
    () => ymylReview.value?.humanReviewStatus
  ),
  cmsUiEnabled,
  canPublishToCms,
  cmsPublishButtonLabel,
  handlers: {
    goBrief: () => goDetailTab("brief"),
    goDiagnose: (section) => goDetailTab("diagnose", section as DiagnoseSection),
    goArticle: () => goDetailTab("article"),
    handleRetry,
    handlePublishToCms,
    handleDownloadHtml: () => handleDownloadExport("html"),
    handleRerunOptimization: () => goDetailTab("diagnose", "seo")
  }
});

async function handleBriefUpdated() {
  startPolling();
  await fetchOnce();
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

async function handlePause() {
  if (!job.value || !canPause.value || pausing.value) return;

  pausing.value = true;
  try {
    await pauseArticleJob(projectId.value, jobId.value);
    message("任务已暂停，可随时继续执行", { type: "success" });
    await fetchOnce();
  } catch (error) {
    const msg = error instanceof Error ? error.message : "暂停失败";
    message(msg, { type: "error" });
  } finally {
    pausing.value = false;
  }
}

async function handleResume() {
  if (!canResume.value || resuming.value) return;

  resuming.value = true;
  try {
    await resumeArticleJob(projectId.value, jobId.value);
    message("任务已恢复，正在从断点继续执行…", { type: "success" });
    startPolling();
    await fetchOnce();
  } catch (error) {
    const msg = error instanceof Error ? error.message : "继续执行失败";
    message(msg, { type: "error" });
  } finally {
    resuming.value = false;
  }
}

async function handleDelete() {
  if (!job.value || deleting.value) return;

  const inProgress =
    job.value.status !== "FAILED" && job.value.status !== "COMPLETED";
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

async function handleRerunOptimization(
  reason: "gsc_underperform" | "manual" = "manual"
) {
  if (!canRerunOptimization.value) return;

  rerunningOptimization.value = true;
  try {
    await rerunArticleOptimization(projectId.value, jobId.value, { reason });
    message("已重新入队优化评分，请稍候…", { type: "success" });
    goDetailTab("diagnose", "seo");
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
    message(PARAPHRASE_RERUN_QUEUED, { type: "success" });
    goDetailTab("article");
    startPolling();
    await fetchOnce();
  } catch (error) {
    const msg = error instanceof Error ? error.message : PARAPHRASE_RERUN_FAILED;
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
    message(
      payload?.serpArticlesOnly === false
        ? "已放宽筛选并更新搜索结果"
        : "搜索结果已更新",
      {
        type: "success"
      }
    );
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
    goDetailTab("diagnose", "seo");
    if (result.status === "OPTIMIZING") {
      message("已采纳新版本，正在重新评分（本地 + Semrush）…", {
        type: "success"
      });
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

function handlePrePublishChecklistAction(
  action: Exclude<
    PublishChecklistAction,
    "go_ymyl" | "go_edit" | "go_internal_links" | "go_images" | "go_sites" | "go_seo"
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
</script>
