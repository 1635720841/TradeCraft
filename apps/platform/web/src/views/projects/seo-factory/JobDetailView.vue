<!--
  文章任务详情页：展示任务状态与结果，非终态时自动轮询。

  边界：
  - 不负责：工作流控制（仅展示状态）
-->
<template>
  <div class="p-4 space-y-4">
    <el-card v-loading="loading && !job" shadow="never">
      <template #header>
        <div class="flex items-center justify-between">
          <span class="font-medium">任务详情</span>
          <div class="flex items-center gap-2">
            <el-tag v-if="polling" type="info" size="small">自动刷新中</el-tag>
            <el-button
              v-if="canRetry"
              type="primary"
              :loading="retrying"
              @click="handleRetry"
            >
              续跑任务
            </el-button>
            <el-button @click="goBack">返回列表</el-button>
          </div>
        </div>
      </template>

      <template v-if="job">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="目标关键词">
            {{ job.targetKeyword }}
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="dictTagType(jobStatusDict, job.status)">
              {{ dictLabel(jobStatusDict, job.status) }}
            </el-tag>
            <p
              v-if="optimizingProgressMessage"
              class="mt-2 text-sm text-gray-600"
            >
              {{ optimizingProgressMessage }}
            </p>
            <p
              v-if="isOptimizingStale"
              class="mt-1 text-sm text-amber-600"
            >
              超过预期时间仍无进展，可能 API 已中断；请到「SEO 评分」点「取消检测」或「续跑任务」
            </p>
          </el-descriptions-item>
          <el-descriptions-item label="Semrush 终检">
            {{ job.semrushScore ?? "-" }} / 10
          </el-descriptions-item>
          <el-descriptions-item label="本地预检">
            <el-tag
              v-if="job.localSeoScore != null"
              :type="job.localSeoScore >= LOCAL_SEO_PASS_THRESHOLD ? 'success' : 'warning'"
              size="small"
              class="mr-2"
            >
              {{ job.localSeoScore }} / 100
            </el-tag>
            <span v-else>- / 100</span>
            <span v-if="job.localSeoScore != null" class="text-sm text-gray-500">
              门槛 {{ LOCAL_SEO_PASS_THRESHOLD }}
            </span>
          </el-descriptions-item>
          <el-descriptions-item label="YMYL 审查">
            <el-tag v-if="ymylReviewCompleted" :type="requiresHumanReview ? 'warning' : 'success'">
              {{ requiresHumanReview ? "需人工审核" : "已通过" }}
            </el-tag>
            <span v-else class="text-gray-500">未完成</span>
          </el-descriptions-item>
          <el-descriptions-item label="内链">
            <span v-if="job.draftData?.internalLinksApplied">
              已植入 {{ internalLinkCount }} 条
            </span>
            <span v-else class="text-gray-500">未完成</span>
          </el-descriptions-item>
          <el-descriptions-item label="配图">
            <span v-if="job.draftData?.imagesApplied">
              已植入 {{ articleImageCount }} 张
            </span>
            <span v-else class="text-gray-500">未完成</span>
          </el-descriptions-item>
          <el-descriptions-item label="导出">
            <div v-if="job.outputUrl" class="flex flex-wrap gap-2">
              <el-button
                type="primary"
                link
                :loading="exportDownloading === 'html'"
                @click="handleDownloadExport('html')"
              >
                下载 HTML
              </el-button>
              <el-button
                type="primary"
                link
                :loading="exportDownloading === 'jsonld'"
                @click="handleDownloadExport('jsonld')"
              >
                下载 JSON-LD
              </el-button>
            </div>
            <span v-else-if="requiresHumanReview" class="text-amber-600">
              YMYL 需人工审核，未生成可发布 HTML
            </span>
            <span v-else>-</span>
          </el-descriptions-item>
          <el-descriptions-item v-if="job.errorMessage" label="错误信息">
            <span class="text-red-500">{{ job.errorMessage }}</span>
            <p
              v-if="resumeStepLabel"
              class="mt-1 text-sm text-gray-600"
            >
              续跑将从「{{ resumeStepLabel }}」步骤继续，不会重头跑 SERP / 初稿。
            </p>
          </el-descriptions-item>
          <el-descriptions-item label="任务 ID">
            {{ job.id }}
          </el-descriptions-item>
          <el-descriptions-item label="Trace ID">
            {{ job.traceId }}
          </el-descriptions-item>
          <el-descriptions-item label="创建时间">
            {{ formatTime(job.createdAt) }}
          </el-descriptions-item>
          <el-descriptions-item v-if="job.updatedAt" label="更新时间">
            {{ formatTime(job.updatedAt) }}
          </el-descriptions-item>
        </el-descriptions>

        <el-alert
          v-if="requiresHumanReview"
          class="mt-4"
          type="warning"
          :closable="false"
          show-icon
          title="需人工审核（YMYL）"
          :description="ymylReviewDescription"
        />
      </template>

      <el-empty v-else-if="!loading" description="任务不存在" />
    </el-card>

    <el-card v-if="job" shadow="never">
      <template #header>
        <span class="font-medium">生成结果</span>
      </template>

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
            :local-seo-score="job.localSeoScore"
            :semrush-score="job.semrushScore"
            :seo-check-data="job.seoCheckData"
            :optimize-history="job.draftData?.optimizeHistory"
            :can-check="hasDraftContent"
            :checking="isSemrushChecking"
            :check-stale="isOptimizingStale"
            :optimizing-message="optimizingProgressMessage"
            :can-rewrite="canTriggerRewrite"
            :rewriting="isRewriting"
            :rewrite-blocked-reason="rewriteBlockedReason"
            @run-semrush-check="handleSemrushCheck"
            @cancel-semrush-check="handleCancelSemrushCheck"
            @rewrite="rewriteDrawerOpen = true"
          />
        </el-tab-pane>
        <el-tab-pane label="初稿预览" name="draft">
          <ArticleJobRewriteResult
            v-if="rewriteCandidate"
            class="mb-4"
            :candidate="rewriteCandidate"
            :accepting="rewriteAccepting"
            :discarding="rewriteDiscarding"
            @accept="handleAcceptRewrite"
            @discard="handleDiscardRewrite"
          />

          <ArticleJobDraftPreview
            :draft-data="job.draftData"
            :can-rewrite="canTriggerRewrite"
            :rewriting="isRewriting"
            :rewrite-blocked-reason="rewriteBlockedReason"
            :show-current-label="Boolean(rewriteCandidate)"
            @rewrite="rewriteDrawerOpen = true"
          />
        </el-tab-pane>
        <el-tab-pane label="内容审查" name="ymyl">
          <ArticleJobYmylPanel :ymyl-review="ymylReview" />
        </el-tab-pane>
        <el-tab-pane label="内链" name="links">
          <ArticleJobInternalLinksPanel
            :internal-links="job.draftData?.internalLinks"
            :internal-links-applied="job.draftData?.internalLinksApplied"
          />
        </el-tab-pane>
        <el-tab-pane label="配图" name="images">
          <ArticleJobImagesPanel
            :article-images="job.draftData?.articleImages"
            :images-applied="job.draftData?.imagesApplied"
          />
        </el-tab-pane>
        <el-tab-pane label="Brief 大纲" name="brief">
          <ArticleJobBriefPanel :brief-data="job.briefData" />
        </el-tab-pane>
        <el-tab-pane label="SERP 检索" name="serp">
          <ArticleJobSerpPanel :serp-data="job.serpData" />
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <ArticleJobRewriteDrawer
      v-model="rewriteDrawerOpen"
      :suggestions="rewriteSuggestions"
      :submitting="rewriteSubmitting"
      @submit="handleRewriteSubmit"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  acceptArticleRewrite,
  cancelSemrushCheck,
  discardArticleRewrite,
  downloadArticleExportHtml,
  downloadArticleExportJsonLd,
  retryArticleJob,
  triggerArticleRewrite,
  triggerSemrushCheck
} from "@/api/seo-factory/article-job";
import type { RewriteArticleJobPayload } from "@/api/seo-factory/types";
import { useArticleJobPolling } from "@/composables/seo-factory/useArticleJobPolling";
import { message } from "@/utils/message";
import { jobStatusDict } from "@/constants/dicts/seo-factory";
import { LOCAL_SEO_PASS_THRESHOLD } from "@/constants/seo-factory";
import { dictLabel, dictTagType } from "@/utils/dict";
import { workflowStepLabel } from "@/utils/seo-factory/workflow-progress";
import ArticleJobBriefPanel from "./components/ArticleJobBriefPanel.vue";
import ArticleJobDraftPreview from "./components/ArticleJobDraftPreview.vue";
import ArticleJobImagesPanel from "./components/ArticleJobImagesPanel.vue";
import ArticleJobInternalLinksPanel from "./components/ArticleJobInternalLinksPanel.vue";
import ArticleJobRewriteDrawer from "./components/ArticleJobRewriteDrawer.vue";
import ArticleJobRewriteResult from "./components/ArticleJobRewriteResult.vue";
import ArticleJobSeoScorePanel from "./components/ArticleJobSeoScorePanel.vue";
import ArticleJobSerpPanel from "./components/ArticleJobSerpPanel.vue";
import ArticleJobYmylPanel from "./components/ArticleJobYmylPanel.vue";

defineOptions({ name: "JobDetailView" });

const route = useRoute();
const router = useRouter();
const activeTab = ref("seo");

const projectId = computed(() => route.params.projectId as string);
const jobId = computed(() => route.params.jobId as string);

const { job, loading, polling, fetchOnce, startPolling } = useArticleJobPolling(
  projectId,
  jobId
);

const semrushChecking = ref(false);
const retrying = ref(false);
const rewriteDrawerOpen = ref(false);
const rewriteSubmitting = ref(false);
const rewriteAccepting = ref(false);
const rewriteDiscarding = ref(false);
const exportDownloading = ref<"html" | "jsonld" | null>(null);

const hasDraftContent = computed(() => {
  const content = job.value?.draftData?.content;
  return Boolean(content && content.trim().length > 0);
});

const semrushPending = computed(() => job.value?.seoCheckData?.semrush?.pending ?? null);
const rewritePending = computed(() => job.value?.draftData?.rewritePending ?? null);
const rewriteCandidate = computed(() => job.value?.draftData?.rewriteCandidate ?? null);

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

const ymylReview = computed(() => job.value?.seoCheckData?.ymylReview ?? null);

const ymylReviewCompleted = computed(() => Boolean(ymylReview.value?.reviewedAt));

const requiresHumanReview = computed(
  () => ymylReview.value?.requires_human_review === true
);

const internalLinkCount = computed(() => job.value?.draftData?.internalLinks?.length ?? 0);
const articleImageCount = computed(() => job.value?.draftData?.articleImages?.length ?? 0);

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

const canRetry = computed(() => job.value?.status === "FAILED" && !retrying.value);

const resumeStepLabel = computed(() => {
  const step = job.value?.seoCheckData?.workflow?.failedStep;
  return step ? workflowStepLabel(step) : null;
});

async function handleDownloadExport(kind: "html" | "jsonld") {
  if (!job.value?.outputUrl || exportDownloading.value) return;

  exportDownloading.value = kind;
  try {
    const blob =
      kind === "html"
        ? await downloadArticleExportHtml(projectId.value, jobId.value)
        : await downloadArticleExportJsonLd(projectId.value, jobId.value);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const baseName = job.value.targetKeyword || "article";
    anchor.href = url;
    anchor.download = kind === "html" ? `${baseName}.html` : `${baseName}.jsonld`;
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
    message("已从失败步骤重新入队，正在续跑…", { type: "success" });
    startPolling();
    await fetchOnce();
  } catch (error) {
    const msg = error instanceof Error ? error.message : "重试失败";
    message(msg, { type: "error" });
  } finally {
    retrying.value = false;
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

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("zh-CN");
}

function goBack() {
  router.push({ name: "SeoFactoryJobs", params: { projectId: projectId.value } });
}
</script>
