<!--
  文章任务列表表格：数据展示、分页与审核弹窗。

  边界：
  - 不负责：筛选与批量操作工具栏
-->
<template>
  <el-table
    ref="tableRef"
    v-loading="loading"
    :data="jobs"
    stripe
    style="width: 100%"
    @selection-change="emit('selection-change', $event)"
  >
    <el-table-column type="selection" width="48" />
    <el-table-column prop="targetKeyword" label="目标关键词" min-width="160" show-overflow-tooltip />
    <el-table-column label="站点" width="120" show-overflow-tooltip>
      <template #default="{ row }">
        {{ (row as ArticleJobItem).siteDomain || "-" }}
      </template>
    </el-table-column>
    <el-table-column label="搜索意图" width="100">
      <template #default="{ row }">
        <el-tag
          v-if="(row as ArticleJobItem).searchIntent"
          size="small"
          :type="dictTagType(keywordIntentDict, (row as ArticleJobItem).searchIntent)"
        >
          {{ dictLabel(keywordIntentDict, (row as ArticleJobItem).searchIntent) }}
        </el-tag>
        <span v-else class="job-list-table__muted">-</span>
      </template>
    </el-table-column>
    <el-table-column label="状态" min-width="150">
      <template #default="{ row }">
        <div class="job-list-table__status">
          <el-tag :type="statusCell(row as ArticleJobItem).tag.type" size="small">
            {{ statusCell(row as ArticleJobItem).tag.label }}
          </el-tag>
          <span v-if="statusCell(row as ArticleJobItem).hint" class="job-list-table__progress-hint">
            {{ statusCell(row as ArticleJobItem).hint }}
          </span>
        </div>
      </template>
    </el-table-column>
    <el-table-column v-if="showSeoScore" label="SEO 分数" width="150">
      <template #default="{ row }">
        <span
          :class="{
            'job-list-table__muted': formatJobListSeoScores(row as ArticleJobItem) === '-'
          }"
        >
          {{ formatJobListSeoScores(row as ArticleJobItem) }}
        </span>
      </template>
    </el-table-column>
    <el-table-column label="更新时间" width="120">
      <template #default="{ row }">
        {{ formatJobListUpdatedAt((row as ArticleJobItem).updatedAt) }}
      </template>
    </el-table-column>
    <el-table-column label="操作" min-width="280" fixed="right">
      <template #default="{ row }">
        <el-button type="primary" link @click="emit('go-detail', (row as ArticleJobItem).id)">
          详情
        </el-button>
        <el-button
          v-if="canReviewJob && isBriefPending(row as ArticleJobItem)"
          type="success"
          link
          :loading="approvingBriefId === (row as ArticleJobItem).id"
          @click="emit('brief-approve', (row as ArticleJobItem).id)"
        >
          确认大纲
        </el-button>
        <template v-else-if="canReviewJob && isReviewPending(row as ArticleJobItem)">
          <el-button
            type="success"
            link
            :loading="actingReviewId === (row as ArticleJobItem).id && actingReviewType === 'approve'"
            @click="emit('open-review-dialog', (row as ArticleJobItem).id, 'approve')"
          >
            通过
          </el-button>
          <el-button
            type="danger"
            link
            :loading="actingReviewId === (row as ArticleJobItem).id && actingReviewType === 'reject'"
            @click="emit('open-review-dialog', (row as ArticleJobItem).id, 'reject')"
          >
            驳回
          </el-button>
        </template>
        <el-button
          v-else-if="(row as ArticleJobItem).status === 'FAILED'"
          type="warning"
          link
          :loading="retryingId === (row as ArticleJobItem).id"
          @click="emit('retry', (row as ArticleJobItem).id)"
        >
          重新生成
        </el-button>
        <el-button
          v-else-if="cmsUiEnabled && canPublishJobToCms(row as ArticleJobItem)"
          type="success"
          link
          :loading="publishingId === (row as ArticleJobItem).id"
          @click="emit('publish', (row as ArticleJobItem).id)"
        >
          推送
        </el-button>
        <el-button
          type="danger"
          link
          :loading="deletingId === (row as ArticleJobItem).id"
          @click="emit('delete', (row as ArticleJobItem).id, (row as ArticleJobItem).targetKeyword)"
        >
          删除
        </el-button>
      </template>
    </el-table-column>
  </el-table>

  <div class="mt-4 flex justify-end">
    <el-pagination
      :current-page="page"
      :page-size="limit"
      :total="total"
      :page-sizes="[10, 20, 50]"
      layout="total, sizes, prev, pager, next"
      @update:current-page="emit('update:page', $event)"
      @update:page-size="emit('update:limit', $event)"
      @current-change="emit('page-change')"
      @size-change="emit('size-change')"
    />
  </div>

  <el-empty v-if="!loading && jobs.length === 0" description="暂无任务" />

  <el-dialog
    :model-value="reviewDialogVisible"
    :title="reviewDialogTitle"
    width="420px"
    destroy-on-close
    @update:model-value="emit('update:review-dialog-visible', $event)"
  >
    <el-form label-width="72px">
      <el-form-item label="备注">
        <el-input
          :model-value="reviewNote"
          type="textarea"
          :rows="3"
          maxlength="500"
          show-word-limit
          placeholder="可选：填写审核意见"
          @update:model-value="emit('update:review-note', $event)"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:review-dialog-visible', false)">取消</el-button>
      <el-button
        :type="reviewDialogAction === 'approve' ? 'success' : 'danger'"
        :loading="actingReviewId !== null"
        @click="emit('submit-review')"
      >
        确认{{ reviewDialogAction === "approve" ? "通过" : "驳回" }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from "vue";
import type { TableInstance } from "element-plus";
import type { ArticleJobItem } from "@/api/seo-factory/types";
import { keywordIntentDict } from "@/constants/dicts/seo-factory";
import { dictLabel, dictTagType } from "@/utils/dict";
import { canPublishJobToCms } from "@/utils/seo-factory/cms-publish-status";
import {
  formatJobListSeoScores,
  formatJobListUpdatedAt,
  jobListProgressHint
} from "@/utils/seo-factory/job-list-display";
import { isBriefPending, isReviewPending } from "@/utils/seo-factory/job-progress";
import { resolveJobListPrimaryTag } from "@/utils/seo-factory/job-list-status";

defineOptions({ name: "JobListTable" });

withDefaults(
  defineProps<{
    jobs: ArticleJobItem[];
    loading: boolean;
    page: number;
    limit: number;
    total: number;
    canReviewJob: boolean;
    cmsUiEnabled: boolean;
    approvingBriefId: string | null;
    actingReviewId: string | null;
    actingReviewType: "approve" | "reject" | null;
    retryingId: string | null;
    publishingId: string | null;
    deletingId: string | null;
    reviewDialogVisible: boolean;
    reviewDialogTitle: string;
    reviewDialogAction: "approve" | "reject";
    reviewNote: string;
    showSeoScore?: boolean;
  }>(),
  { showSeoScore: false }
);

const emit = defineEmits<{
  "selection-change": [rows: ArticleJobItem[]];
  "go-detail": [jobId: string];
  "brief-approve": [jobId: string];
  "open-review-dialog": [jobId: string, action: "approve" | "reject"];
  retry: [jobId: string];
  publish: [jobId: string];
  delete: [jobId: string, targetKeyword: string];
  "update:page": [page: number];
  "update:limit": [limit: number];
  "page-change": [];
  "size-change": [];
  "update:review-dialog-visible": [visible: boolean];
  "update:review-note": [note: string];
  "submit-review": [];
}>();

const tableRef = ref<TableInstance>();

function statusCell(job: ArticleJobItem) {
  return {
    tag: resolveJobListPrimaryTag(job),
    hint: jobListProgressHint(job)
  };
}

defineExpose({
  clearSelection: () => tableRef.value?.clearSelection()
});
</script>

<style scoped lang="scss">
.job-list-table__status {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}

.job-list-table__progress-hint {
  font-size: 12px;
  line-height: 1.3;
  color: var(--mw-text-muted);
}

.job-list-table__muted {
  color: var(--mw-text-muted);
}
</style>
