<!--
  文章任务列表页：展示项目下所有生成任务，支持创建与查看详情。

  边界：
  - 不负责：工作流执行（后端 BullMQ）
-->
<template>
  <div class="p-4">
    <el-card shadow="never">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="font-medium">文章任务</span>
          <div class="flex flex-wrap items-center gap-2">
            <el-select
              v-model="listFilter"
              placeholder="阶段"
              style="width: 160px"
              @change="onListFilterChange"
            >
              <el-option label="全部任务" value="all" />
              <el-option label="待确认大纲" value="outlinePending" />
              <el-option label="敏感内容待审核" value="reviewPending" />
              <el-option label="生成中" value="generating" />
              <el-option label="生成失败" value="failed" />
              <el-option v-if="cmsUiEnabled" label="待发布" value="publishPending" />
              <el-option label="稿件待处理" value="staleDraft" />
              <el-option v-if="cmsUiEnabled" label="发布失败" value="publishFailed" />
            </el-select>
            <el-select
              v-model="filterSiteId"
              clearable
              placeholder="按站点"
              style="width: 160px"
              :loading="sitesLoading"
              @change="onSiteFilterChange"
            >
              <el-option
                v-for="site in sites"
                :key="site.id"
                :label="site.domain"
                :value="site.id"
              />
            </el-select>
            <el-tag v-if="polling" type="info" size="small">自动刷新中</el-tag>
            <el-button @click="goContentScore">内容评分</el-button>
            <el-button @click="goSites">站点</el-button>
            <el-button @click="() => fetchJobs()">刷新</el-button>
            <el-button type="primary" @click="goCreate">新建任务</el-button>
          </div>
        </div>
      </template>

      <div v-if="stageAlert" class="mb-4">
        <el-alert
          :type="stageAlert.type"
          :closable="false"
          show-icon
          :title="stageAlert.title"
        >
          <template v-if="stageAlert.description" #default>
            {{ stageAlert.description }}
            <el-button link type="primary" @click="clearListFilter">查看全部任务</el-button>
          </template>
        </el-alert>
      </div>

      <div v-if="selectedJobs.length" class="mb-4 flex flex-wrap items-center gap-2">
        <span class="text-sm text-gray-600">已选 {{ selectedJobs.length }} 项</span>
        <el-button
          v-if="briefApprovableSelected.length > 0"
          size="small"
          type="success"
          :loading="batchBriefApproving"
          @click="handleBatchBriefApprove"
        >
          批量确认大纲（{{ briefApprovableSelected.length }}）
        </el-button>
        <el-button
          size="small"
          type="warning"
          :loading="batchRetrying"
          :disabled="retryableSelected.length === 0"
          @click="handleBatchRetry"
        >
          批量重试{{ retryableSelected.length ? `（${retryableSelected.length}）` : "" }}
        </el-button>
        <el-button
          v-if="cmsUiEnabled"
          size="small"
          type="success"
          :loading="batchPublishing"
          :disabled="publishableSelected.length === 0"
          @click="handleBatchPublish"
        >
          批量推送 CMS{{ publishableSelected.length ? `（${publishableSelected.length}）` : "" }}
        </el-button>
        <el-button
          size="small"
          :loading="batchExporting"
          :disabled="exportableSelected.length === 0"
          @click="handleBatchExport"
        >
          批量导出{{ exportableSelected.length ? `（${exportableSelected.length}）` : "" }}
        </el-button>
        <el-button
          size="small"
          type="danger"
          :loading="batchDeleting"
          @click="handleBatchDelete"
        >
          批量删除（{{ selectedJobs.length }}）
        </el-button>
      </div>

      <el-table
        ref="tableRef"
        v-loading="loading"
        :data="jobs"
        stripe
        style="width: 100%"
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="48" />
        <el-table-column prop="targetKeyword" label="目标关键词" min-width="180" />
        <el-table-column label="站点" width="130" show-overflow-tooltip>
          <template #default="{ row }">
            {{ (row as ArticleJobItem).siteDomain || "-" }}
          </template>
        </el-table-column>
        <el-table-column label="阶段" min-width="140">
          <template #default="{ row }">
            <el-tag :type="dictTagType(jobStatusDict, row.status)" size="small">
              {{ dictLabel(jobStatusDict, row.status) }}
            </el-tag>
            <el-tag
              v-if="isBriefPending(row as ArticleJobItem)"
              type="warning"
              size="small"
              class="ml-1"
            >
              待确认大纲
            </el-tag>
            <el-tag
              v-else-if="isReviewPending(row as ArticleJobItem)"
              type="warning"
              size="small"
              class="ml-1"
            >
              待审核
            </el-tag>
            <el-tag
              v-else-if="draftEditLabel(row as ArticleJobItem)"
              type="warning"
              size="small"
              class="ml-1"
            >
              {{ draftEditLabel(row as ArticleJobItem) }}
            </el-tag>
            <el-tag
              v-else-if="cmsUiEnabled"
              size="small"
              class="ml-1"
              :type="cmsPublishStatusTagType(resolveCmsPublishStatus(row as ArticleJobItem))"
            >
              {{ cmsPublishStatusLabel(resolveCmsPublishStatus(row as ArticleJobItem), row as ArticleJobItem) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="进度" min-width="200">
          <template #default="{ row }">
            <ArticleJobProgressStepper :job="row as ArticleJobItem" compact />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="280" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="goDetail(row.id)">详情</el-button>
            <el-button
              v-if="isBriefPending(row as ArticleJobItem)"
              type="success"
              link
              :loading="approvingBriefId === (row as ArticleJobItem).id"
              @click="handleBriefApprove((row as ArticleJobItem).id)"
            >
              确认大纲
            </el-button>
            <el-button
              v-if="isReviewPending(row as ArticleJobItem)"
              type="success"
              link
              :loading="actingReviewId === (row as ArticleJobItem).id && actingReviewType === 'approve'"
              @click="openReviewDialog((row as ArticleJobItem).id, 'approve')"
            >
              通过
            </el-button>
            <el-button
              v-if="isReviewPending(row as ArticleJobItem)"
              type="danger"
              link
              :loading="actingReviewId === (row as ArticleJobItem).id && actingReviewType === 'reject'"
              @click="openReviewDialog((row as ArticleJobItem).id, 'reject')"
            >
              驳回
            </el-button>
            <el-button
              v-if="(row as ArticleJobItem).status === 'FAILED'"
              type="warning"
              link
              :loading="retryingId === (row as ArticleJobItem).id"
              @click="handleRetry((row as ArticleJobItem).id)"
            >
              重新生成
            </el-button>
            <el-button
              v-if="cmsUiEnabled && canPublishJobToCms(row as ArticleJobItem)"
              type="success"
              link
              :loading="publishingId === (row as ArticleJobItem).id"
              @click="handlePublish((row as ArticleJobItem).id)"
            >
              推送
            </el-button>
            <el-button
              type="danger"
              link
              :loading="deletingId === (row as ArticleJobItem).id"
              @click="handleDelete((row as ArticleJobItem).id, (row as ArticleJobItem).targetKeyword)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="mt-4 flex justify-end">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="limit"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @current-change="() => fetchJobs()"
          @size-change="onSizeChange"
        />
      </div>

      <el-empty v-if="!loading && jobs.length === 0" description="暂无任务" />
    </el-card>

    <el-dialog v-model="reviewDialogVisible" :title="reviewDialogTitle" width="420px" destroy-on-close>
      <el-form label-width="72px">
        <el-form-item label="备注">
          <el-input
            v-model="reviewNote"
            type="textarea"
            :rows="3"
            maxlength="500"
            show-word-limit
            placeholder="可选：填写审核意见"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="reviewDialogVisible = false">取消</el-button>
        <el-button
          :type="reviewDialogAction === 'approve' ? 'success' : 'danger'"
          :loading="actingReviewId !== null"
          @click="submitReview"
        >
          确认{{ reviewDialogAction === "approve" ? "通过" : "驳回" }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { TableInstance } from "element-plus";
import { ElMessageBox } from "element-plus";
import {
  approveArticleBrief,
  approveArticleReview,
  batchApproveArticleBriefs,
  batchDeleteArticleJobs,
  batchExportArticleJobs,
  batchPublishArticleJobs,
  batchRetryArticleJobs,
  deleteArticleJob,
  listArticleJobs,
  publishArticleJob,
  rejectArticleReview,
  retryArticleJob
} from "@/api/seo-factory/article-job";
import { listSites } from "@/api/seo-factory/site";
import type { ArticleJobItem, SiteItem } from "@/api/seo-factory/types";
import { jobStatusDict, JOB_TERMINAL_STATUSES } from "@/constants/dicts/seo-factory";
import { WORDPRESS_CMS_UI_ENABLED } from "@/constants/feature-flags";
import { dictLabel, dictTagType } from "@/utils/dict";
import { message } from "@/utils/message";
import {
  canPublishJobToCms,
  cmsPublishStatusLabel,
  cmsPublishStatusTagType,
  resolveCmsPublishStatus
} from "@/utils/seo-factory/cms-publish-status";
import { draftEditStatusLabel } from "@/utils/seo-factory/draft-edit-preview";
import { isBriefPending, isReviewPending } from "@/utils/seo-factory/job-progress";
import ArticleJobProgressStepper from "./components/ArticleJobProgressStepper.vue";

defineOptions({ name: "JobListView" });

const cmsUiEnabled = WORDPRESS_CMS_UI_ENABLED;

const route = useRoute();
const router = useRouter();
const projectId = route.params.projectId as string;

const tableRef = ref<TableInstance>();
const loading = ref(false);
const polling = ref(false);
const jobs = ref<ArticleJobItem[]>([]);
const selectedJobs = ref<ArticleJobItem[]>([]);
const page = ref(1);
const limit = ref(20);
const total = ref(0);
const retryingId = ref<string | null>(null);
const publishingId = ref<string | null>(null);
const batchRetrying = ref(false);
const batchBriefApproving = ref(false);
const batchPublishing = ref(false);
const batchExporting = ref(false);
const batchDeleting = ref(false);
const deletingId = ref<string | null>(null);
const approvingBriefId = ref<string | null>(null);
const reviewDialogVisible = ref(false);
const reviewDialogAction = ref<"approve" | "reject">("approve");
const reviewJobId = ref("");
const reviewNote = ref("");
const actingReviewId = ref<string | null>(null);
const actingReviewType = ref<"approve" | "reject" | null>(null);
let pollTimer: ReturnType<typeof setInterval> | null = null;

const reviewDialogTitle = computed(() =>
  reviewDialogAction.value === "approve" ? "通过审核" : "驳回审核"
);

type JobListStage =
  | "all"
  | "outlinePending"
  | "reviewPending"
  | "generating"
  | "failed"
  | "publishPending"
  | "staleDraft"
  | "publishFailed";

const listFilter = ref<JobListStage>("all");
const filterSiteId = ref("");
const sites = ref<SiteItem[]>([]);
const sitesLoading = ref(false);

const stageAlert = computed(() => {
  switch (listFilter.value) {
    case "outlinePending":
      return {
        type: "warning" as const,
        title: "仅显示待确认大纲的任务",
        description: "勾选多条后点「批量确认大纲」，或逐条「确认大纲」；也可进详情核对后再确认。"
      };
    case "reviewPending":
      return {
        type: "warning" as const,
        title: "仅显示敏感内容待审核的任务",
        description: "命中 YMYL 敏感主题需人工放行；可逐条「通过」或「驳回」，也可进详情查看全文。"
      };
    case "generating":
      return {
        type: "info" as const,
        title: "仅显示生成中的任务",
        description: "系统正在分析搜索结果并生成正文，可在进度列查看当前步骤。"
      };
    case "failed":
      return {
        type: "error" as const,
        title: "仅显示生成失败的任务",
        description: "可勾选后批量重试，或逐条点击「重新生成」。"
      };
    case "publishPending":
      return {
        type: "info" as const,
        title: "仅显示待发布的任务",
        description: "文章已生成完成，可勾选后「批量推送 CMS」，或逐条点击推送。"
      };
    case "staleDraft":
      return {
        type: "warning" as const,
        title: "仅显示编辑后待处理的任务",
        description: "正文改过后需重新检查评分或导出，请进入任务详情按黄色提示操作。"
      };
    case "publishFailed":
      return {
        type: "error" as const,
        title: "仅显示发布失败的任务",
        description: ""
      };
    default:
      return null;
  }
});

const outlinePendingFilter = computed(() => listFilter.value === "outlinePending");
const reviewPendingFilter = computed(() => listFilter.value === "reviewPending");
const generatingFilter = computed(() => listFilter.value === "generating");
const failedFilter = computed(() => listFilter.value === "failed");
const publishPendingFilter = computed(() => listFilter.value === "publishPending");
const staleDraftFilter = computed(() => listFilter.value === "staleDraft");
const publishFailedFilter = computed(() => listFilter.value === "publishFailed");

const hasActiveJobs = computed(() =>
  jobs.value.some(
    (job) => !JOB_TERMINAL_STATUSES.includes(job.status as (typeof JOB_TERMINAL_STATUSES)[number])
  )
);

const retryableSelected = computed(() =>
  selectedJobs.value.filter((job) => job.status === "FAILED")
);

const briefApprovableSelected = computed(() =>
  selectedJobs.value.filter((job) => isBriefPending(job))
);

const publishableSelected = computed(() =>
  selectedJobs.value.filter((job) => canPublishJobToCms(job))
);

const exportableSelected = computed(() =>
  selectedJobs.value.filter((job) => job.exportReady === true)
);

function draftEditLabel(row: ArticleJobItem): string | null {
  return draftEditStatusLabel(row);
}

function handleSelectionChange(rows: ArticleJobItem[]) {
  selectedJobs.value = rows;
}

async function fetchJobs(showLoading = true) {
  if (showLoading) loading.value = true;
  try {
    const res = await listArticleJobs(projectId, page.value, limit.value, {
      briefPending: outlinePendingFilter.value,
      reviewPending: reviewPendingFilter.value,
      generating: generatingFilter.value,
      cmsPublishFailed: publishFailedFilter.value,
      cmsPublishPending: publishPendingFilter.value,
      staleDraft: staleDraftFilter.value,
      status: failedFilter.value ? "FAILED" : undefined,
      siteId: filterSiteId.value || undefined
    });
    jobs.value = res.data ?? [];
    total.value = res.meta?.pagination?.total ?? jobs.value.length;
  } finally {
    if (showLoading) loading.value = false;
    syncPolling();
  }
}

function syncPolling() {
  if (hasActiveJobs.value) {
    startPolling();
  } else {
    stopPolling();
  }
}

function startPolling() {
  if (pollTimer) return;
  polling.value = true;
  pollTimer = setInterval(() => {
    if (hasActiveJobs.value) {
      void fetchJobs(false);
    }
  }, 5000);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  polling.value = false;
}

function onSizeChange() {
  page.value = 1;
  void fetchJobs();
}

async function handleBriefApprove(jobId: string) {
  approvingBriefId.value = jobId;
  try {
    await approveArticleBrief(projectId, jobId);
    message("大纲已确认，正在生成正文…", { type: "success" });
    await fetchJobs(false);
    startPolling();
  } catch (error) {
    message(error instanceof Error ? error.message : "确认失败", { type: "error" });
  } finally {
    approvingBriefId.value = null;
  }
}

async function handleBatchBriefApprove() {
  if (briefApprovableSelected.value.length === 0) return;
  batchBriefApproving.value = true;
  try {
    const jobIds = briefApprovableSelected.value.map((job) => job.id);
    const result = await batchApproveArticleBriefs(projectId, jobIds);
    message(
      `已确认 ${result.approved} 篇${result.failed ? `，${result.failed} 篇失败` : ""}，正在生成正文…`,
      { type: result.approved > 0 ? "success" : "warning" }
    );
    if (result.failed > 0) {
      const keywordById = new Map(
        briefApprovableSelected.value.map((job) => [job.id, job.targetKeyword])
      );
      const detail = result.results
        .filter((item) => !item.ok)
        .map((item) => `• ${keywordById.get(item.jobId) ?? item.jobId}：${item.error ?? "失败"}`)
        .join("\n");
      await ElMessageBox.alert(detail, `${result.failed} 篇确认失败`, {
        type: "warning",
        confirmButtonText: "知道了"
      });
    }
    tableRef.value?.clearSelection();
    await fetchJobs(false);
    if (result.approved > 0) startPolling();
  } finally {
    batchBriefApproving.value = false;
  }
}

function openReviewDialog(jobId: string, action: "approve" | "reject") {
  reviewJobId.value = jobId;
  reviewDialogAction.value = action;
  reviewNote.value = "";
  reviewDialogVisible.value = true;
}

async function submitReview() {
  actingReviewId.value = reviewJobId.value;
  actingReviewType.value = reviewDialogAction.value;
  try {
    const note = reviewNote.value.trim() || undefined;
    if (reviewDialogAction.value === "approve") {
      await approveArticleReview(projectId, reviewJobId.value, note);
      message("已通过审核，HTML 导出已生成", { type: "success" });
    } else {
      await rejectArticleReview(projectId, reviewJobId.value, note);
      message("已驳回审核", { type: "warning" });
    }
    reviewDialogVisible.value = false;
    await fetchJobs(false);
  } catch (error) {
    message(error instanceof Error ? error.message : "审核失败", { type: "error" });
  } finally {
    actingReviewId.value = null;
    actingReviewType.value = null;
  }
}

async function handleRetry(jobId: string) {
  retryingId.value = jobId;
  try {
    await retryArticleJob(projectId, jobId);
    message("已从失败步骤重新入队，正在重新生成…", { type: "success" });
    await fetchJobs(false);
    startPolling();
  } finally {
    retryingId.value = null;
  }
}

async function handlePublish(jobId: string) {
  publishingId.value = jobId;
  try {
    await publishArticleJob(projectId, jobId);
    message("已推送到 CMS 草稿", { type: "success" });
    await fetchJobs(false);
  } catch (error) {
    message(error instanceof Error ? error.message : "推送失败", { type: "error" });
  } finally {
    publishingId.value = null;
  }
}

async function handleBatchRetry() {
  if (retryableSelected.value.length === 0) return;
  batchRetrying.value = true;
  try {
    const result = await batchRetryArticleJobs(
      projectId,
      retryableSelected.value.map((job) => job.id)
    );
    message(`已重试 ${result.retried} 个任务${result.failed ? `，${result.failed} 个跳过` : ""}`, {
      type: result.retried > 0 ? "success" : "warning"
    });
    tableRef.value?.clearSelection();
    await fetchJobs(false);
    startPolling();
  } finally {
    batchRetrying.value = false;
  }
}

async function handleBatchExport() {
  if (exportableSelected.value.length === 0) return;
  batchExporting.value = true;
  try {
    const { blob, meta } = await batchExportArticleJobs(
      projectId,
      exportableSelected.value.map((job) => job.id)
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `batch-export-${new Date().toISOString().slice(0, 10)}.zip`;
    anchor.click();
    URL.revokeObjectURL(url);
    message(
      `已导出 ${meta.exported} 篇${meta.failed ? `，${meta.failed} 篇跳过` : ""}`,
      { type: meta.exported > 0 ? "success" : "warning" }
    );
    if (meta.failed > 0 && meta.failures.length > 0) {
      const detail = meta.failures
        .map((item) => `• ${item.targetKeyword}：${item.error}`)
        .join("\n");
      await ElMessageBox.alert(detail, `${meta.failed} 篇导出失败`, {
        type: "warning",
        confirmButtonText: "知道了"
      });
    }
    tableRef.value?.clearSelection();
  } catch (error) {
    message(error instanceof Error ? error.message : "批量导出失败", { type: "error" });
  } finally {
    batchExporting.value = false;
  }
}

function buildDeleteConfirmMessage(keyword: string, inProgress: boolean): string {
  const base = `确定删除任务「${keyword}」？删除后不可恢复，将一并清理队列任务、导出文件与稿件插图。`;
  return inProgress ? `${base}\n\n该任务仍在进行中，删除后后台可能短暂报错，可忽略。` : base;
}

async function confirmDelete(keyword: string, inProgress: boolean): Promise<boolean> {
  try {
    await ElMessageBox.confirm(buildDeleteConfirmMessage(keyword, inProgress), "删除任务", {
      type: "warning",
      confirmButtonText: "删除",
      cancelButtonText: "取消",
      confirmButtonClass: "el-button--danger"
    });
    return true;
  } catch {
    return false;
  }
}

function isJobInProgress(status: string): boolean {
  return !JOB_TERMINAL_STATUSES.includes(status as (typeof JOB_TERMINAL_STATUSES)[number]);
}

async function handleDelete(jobId: string, targetKeyword: string) {
  const row = jobs.value.find((item) => item.id === jobId);
  const confirmed = await confirmDelete(targetKeyword, row ? isJobInProgress(row.status) : false);
  if (!confirmed) return;

  deletingId.value = jobId;
  try {
    await deleteArticleJob(projectId, jobId);
    message("任务已删除", { type: "success" });
    await fetchJobs(false);
  } finally {
    deletingId.value = null;
  }
}

async function handleBatchDelete() {
  if (selectedJobs.value.length === 0) return;

  const inProgressCount = selectedJobs.value.filter((job) => isJobInProgress(job.status)).length;
  const keywordPreview = selectedJobs.value
    .slice(0, 3)
    .map((job) => job.targetKeyword)
    .join("、");
  const suffix =
    selectedJobs.value.length > 3 ? ` 等 ${selectedJobs.value.length} 项` : "";
  let messageText = `确定删除 ${selectedJobs.value.length} 个任务（${keywordPreview}${suffix}）？删除后不可恢复。`;
  if (inProgressCount > 0) {
    messageText += `\n\n其中 ${inProgressCount} 个仍在进行中。`;
  }

  try {
    await ElMessageBox.confirm(messageText, "批量删除任务", {
      type: "warning",
      confirmButtonText: "删除",
      cancelButtonText: "取消",
      confirmButtonClass: "el-button--danger"
    });
  } catch {
    return;
  }

  batchDeleting.value = true;
  try {
    const result = await batchDeleteArticleJobs(
      projectId,
      selectedJobs.value.map((job) => job.id)
    );
    message(`已删除 ${result.deleted} 个任务${result.failed ? `，${result.failed} 个失败` : ""}`, {
      type: result.deleted > 0 ? "success" : "warning"
    });
    tableRef.value?.clearSelection();
    await fetchJobs(false);
  } finally {
    batchDeleting.value = false;
  }
}

function clearListFilter() {
  listFilter.value = "all";
  router.replace({
    name: "SeoFactoryJobs",
    params: { projectId },
    query: buildJobsQuery()
  });
}

function buildJobsQuery(extra: Record<string, string> = {}) {
  const query: Record<string, string> = { ...extra };
  if (filterSiteId.value) query.siteId = filterSiteId.value;
  return query;
}

function stageQueryValue(stage: JobListStage): string | undefined {
  if (stage === "all") return undefined;
  return stage;
}

function onSiteFilterChange() {
  page.value = 1;
  const query = buildJobsQuery();
  const stage = stageQueryValue(listFilter.value);
  if (stage) query.stage = stage;
  router.replace({ name: "SeoFactoryJobs", params: { projectId }, query });
}

function onListFilterChange(value: JobListStage) {
  page.value = 1;
  const stage = stageQueryValue(value);
  router.replace({
    name: "SeoFactoryJobs",
    params: { projectId },
    query: stage ? buildJobsQuery({ stage }) : buildJobsQuery()
  });
}

function resolveStageFromRoute(): JobListStage {
  const stage = route.query.stage;
  if (typeof stage === "string") {
    const allowed: JobListStage[] = [
      "outlinePending",
      "reviewPending",
      "generating",
      "failed",
      "publishPending",
      "staleDraft",
      "publishFailed"
    ];
    if (allowed.includes(stage as JobListStage)) return stage as JobListStage;
    if (stage === "briefPending") return "outlinePending";
    if (stage === "cmsPublishPending") return "publishPending";
    if (stage === "cmsPublishFailed") return "publishFailed";
    if (stage === "reviewPending") return "reviewPending";
  }
  if (route.query.briefPending === "1" || route.query.briefPending === "true") {
    return "outlinePending";
  }
  if (route.query.status === "FAILED") return "failed";
  if (route.query.cmsPublishPending === "1" || route.query.cmsPublishPending === "true") {
    return "publishPending";
  }
  if (route.query.staleDraft === "1" || route.query.staleDraft === "true") {
    return "staleDraft";
  }
  if (route.query.cmsPublishFailed === "1" || route.query.cmsPublishFailed === "true") {
    return "publishFailed";
  }
  return "all";
}

function syncListFilterFromRoute() {
  const siteId = route.query.siteId;
  filterSiteId.value = typeof siteId === "string" ? siteId : "";
  listFilter.value = resolveStageFromRoute();
}

async function handleBatchPublish() {
  if (publishableSelected.value.length === 0) return;
  batchPublishing.value = true;
  try {
    const result = await batchPublishArticleJobs(
      projectId,
      publishableSelected.value.map((job) => job.id)
    );
    message(
      `已推送 ${result.published} 篇${result.failed ? `，${result.failed} 篇失败` : ""}`,
      { type: result.published > 0 ? "success" : "warning" }
    );
    tableRef.value?.clearSelection();
    await fetchJobs(false);
  } finally {
    batchPublishing.value = false;
  }
}

function goCreate() {
  router.push({
    name: "SeoFactoryJobCreate",
    params: { projectId }
  });
}

function goDetail(jobId: string) {
  router.push({
    name: "SeoFactoryJobDetail",
    params: { projectId, jobId }
  });
}

function goSites() {
  router.push({
    name: "SeoFactorySites",
    params: { projectId }
  });
}

function goContentScore() {
  router.push({
    name: "SeoFactoryContentScore",
    params: { projectId }
  });
}

watch(
  () => [route.query.stage, route.query.siteId],
  () => {
    syncListFilterFromRoute();
    page.value = 1;
    void fetchJobs();
  }
);

async function loadSites() {
  sitesLoading.value = true;
  try {
    sites.value = await listSites(projectId);
  } finally {
    sitesLoading.value = false;
  }
}

onMounted(() => {
  syncListFilterFromRoute();
  void loadSites();
  void fetchJobs();
});

onUnmounted(() => {
  stopPolling();
});
</script>
