<!--
  文章任务列表页：展示项目下所有生成任务，支持创建与查看详情。

  边界：
  - 不负责：工作流执行（后端 BullMQ）
-->
<template>
  <div class="p-4">
    <el-card shadow="never">
      <template #header>
        <JobListToolbar
          part="header"
          :list-filter="listFilter"
          :filter-site-id="filterSiteId"
          :sites="sites"
          :sites-loading="sitesLoading"
          :polling="polling"
          :site-owner-me-filter="siteOwnerMeFilter"
          :cms-ui-enabled="cmsUiEnabled"
          :can-create-job="canCreateJob"
          @refresh="() => fetchJobs()"
          @create="goCreate"
          @list-filter-change="onListFilterChange"
          @site-filter-change="onSiteFilterModelChange"
          @toggle-site-owner-filter="toggleSiteOwnerFilter"
        />
      </template>

      <JobListToolbar
        :list-filter="listFilter"
        :filter-site-id="filterSiteId"
        :keyword-search="keywordSearch"
        :sites="sites"
        :sites-loading="sitesLoading"
        :polling="polling"
        :site-owner-me-filter="siteOwnerMeFilter"
        :cms-ui-enabled="cmsUiEnabled"
        :can-create-job="canCreateJob"
        :stage-alert="stageAlert"
        :assigned-to-me-alert="assignedToMeAlert"
        :site-owner-me-alert="siteOwnerMeAlert"
        :selected-count="selectedJobs.length"
        :brief-approvable-count="briefApprovableSelected.length"
        :retryable-count="retryableSelected.length"
        :publishable-count="publishableSelected.length"
        :exportable-count="exportableSelected.length"
        :batch-brief-approving="batchBriefApproving"
        :batch-retrying="batchRetrying"
        :batch-publishing="batchPublishing"
        :batch-exporting="batchExporting"
        :batch-deleting="batchDeleting"
        @update:keyword-search="keywordSearch = $event"
        @keyword-search-input="onKeywordSearchInput"
        @keyword-search-clear="onKeywordSearchClear"
        @clear-list-filter="clearListFilter"
        @batch-brief-approve="handleBatchBriefApprove"
        @batch-retry="handleBatchRetry"
        @batch-publish="handleBatchPublish"
        @batch-export="handleBatchExport"
        @batch-delete="handleBatchDelete"
      />

      <JobListTable
        ref="tableComponentRef"
        :jobs="jobs"
        :loading="loading"
        v-model:page="page"
        v-model:limit="limit"
        :total="total"
        :can-review-job="canReviewJob"
        :cms-ui-enabled="cmsUiEnabled"
        :approving-brief-id="approvingBriefId"
        :acting-review-id="actingReviewId"
        :acting-review-type="actingReviewType"
        :retrying-id="retryingId"
        :publishing-id="publishingId"
        :deleting-id="deletingId"
        v-model:review-dialog-visible="reviewDialogVisible"
        :review-dialog-title="reviewDialogTitle"
        :review-dialog-action="reviewDialogAction"
        v-model:review-note="reviewNote"
        @selection-change="handleSelectionChange"
        @go-detail="goDetail"
        @brief-approve="handleBriefApprove"
        @open-review-dialog="openReviewDialog"
        @retry="handleRetry"
        @publish="handlePublish"
        @delete="handleDelete"
        @page-change="() => fetchJobs()"
        @size-change="onSizeChange"
        @submit-review="submitReview"
      />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { WORDPRESS_CMS_UI_ENABLED } from "@/constants/feature-flags";
import { useProjectSeoAccess } from "@/composables/seo-factory/useProjectSeoAccess";
import { useJobListQuery } from "@/composables/seo-factory/useJobListQuery";
import { useJobListBatchActions } from "@/composables/seo-factory/useJobListBatchActions";
import JobListToolbar from "./components/job-list/JobListToolbar.vue";
import JobListTable from "./components/job-list/JobListTable.vue";

defineOptions({ name: "JobListView" });

const cmsUiEnabled = WORDPRESS_CMS_UI_ENABLED;

const route = useRoute();
const router = useRouter();
const projectId = route.params.projectId as string;

const { can, canReview } = useProjectSeoAccess();
const canCreateJob = computed(() => can("seo:job:create"));
const canReviewJob = computed(() => canReview());

const tableComponentRef = ref<{ clearSelection: () => void }>();

const {
  loading,
  polling,
  jobs,
  page,
  limit,
  total,
  listFilter,
  filterSiteId,
  keywordSearch,
  sites,
  sitesLoading,
  stageAlert,
  assignedToMeAlert,
  siteOwnerMeAlert,
  siteOwnerMeFilter,
  fetchJobs,
  startPolling,
  onSizeChange,
  onKeywordSearchInput,
  onKeywordSearchClear,
  clearListFilter,
  toggleSiteOwnerFilter,
  onSiteFilterChange,
  onListFilterChange
} = useJobListQuery(projectId);

function onSiteFilterModelChange(value: string | undefined) {
  filterSiteId.value = value ?? "";
  onSiteFilterChange();
}

const {
  selectedJobs,
  retryingId,
  publishingId,
  batchRetrying,
  batchBriefApproving,
  batchPublishing,
  batchExporting,
  batchDeleting,
  deletingId,
  approvingBriefId,
  reviewDialogVisible,
  reviewDialogAction,
  reviewNote,
  actingReviewId,
  actingReviewType,
  reviewDialogTitle,
  retryableSelected,
  briefApprovableSelected,
  publishableSelected,
  exportableSelected,
  handleSelectionChange,
  openReviewDialog,
  handleBriefApprove,
  handleBatchBriefApprove,
  submitReview,
  handleRetry,
  handlePublish,
  handleBatchRetry,
  handleBatchExport,
  handleDelete,
  handleBatchDelete,
  handleBatchPublish
} = useJobListBatchActions({
  projectId,
  jobs,
  clearSelection: () => tableComponentRef.value?.clearSelection(),
  fetchJobs,
  startPolling
});

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
</script>
