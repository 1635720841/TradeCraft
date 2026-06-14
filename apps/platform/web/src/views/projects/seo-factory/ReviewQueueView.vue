<!--
  YMYL 待审核队列：通过/驳回并触发导出。

  边界：
  - 不负责：YMYL 自动检测（后端 content-review）
-->
<template>
  <div class="p-4">
    <el-card shadow="never">
      <template #header>
        <div class="flex items-center justify-between">
          <span class="font-medium">YMYL 待审核</span>
          <el-button link type="primary" @click="fetchReviews">刷新</el-button>
        </div>
      </template>

      <el-alert
        class="mb-4"
        type="info"
        :closable="false"
        show-icon
        title="审核说明"
        description="命中 YMYL 敏感主题的任务会在完成后进入待审核；通过后系统将自动生成可发布 HTML。"
      />

      <el-table v-loading="loading" :data="items" stripe>
        <el-table-column prop="targetKeyword" label="目标关键词" min-width="160" />
        <el-table-column prop="title" label="文章标题" min-width="180" show-overflow-tooltip />
        <el-table-column label="敏感分类" min-width="160">
          <template #default="{ row }">
            <el-tag
              v-for="category in row.ymylReview?.categories ?? []"
              :key="category"
              class="mr-1"
              size="small"
              :type="dictTagType(ymylCategoryDict, category)"
            >
              {{ dictLabel(ymylCategoryDict, category) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="updatedAt" label="完成时间" min-width="170">
          <template #default="{ row }">
            {{ formatTime(row.updatedAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="goDetail(row.id)">查看详情</el-button>
            <el-button
              type="success"
              link
              :loading="actingId === row.id && actingType === 'approve'"
              @click="openReviewDialog(row.id, 'approve')"
            >
              通过
            </el-button>
            <el-button
              type="danger"
              link
              :loading="actingId === row.id && actingType === 'reject'"
              @click="openReviewDialog(row.id, 'reject')"
            >
              驳回
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
          @current-change="fetchReviews"
          @size-change="onSizeChange"
        />
      </div>

      <el-empty v-if="!loading && items.length === 0" description="暂无待审核任务" />
    </el-card>

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="420px" destroy-on-close>
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
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button
          :type="dialogAction === 'approve' ? 'success' : 'danger'"
          :loading="actingId !== null"
          @click="submitReview"
        >
          确认{{ dialogAction === "approve" ? "通过" : "驳回" }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  approveArticleReview,
  listPendingReviews,
  rejectArticleReview
} from "@/api/seo-factory/article-job";
import type { PendingReviewItem } from "@/api/seo-factory/types";
import { ymylCategoryDict } from "@/constants/dicts/seo-factory";
import { dictLabel, dictTagType } from "@/utils/dict";
import { message } from "@/utils/message";

defineOptions({ name: "ReviewQueueView" });

const route = useRoute();
const router = useRouter();
const projectId = route.params.projectId as string;

const loading = ref(false);
const items = ref<PendingReviewItem[]>([]);
const page = ref(1);
const limit = ref(20);
const total = ref(0);

const dialogVisible = ref(false);
const dialogAction = ref<"approve" | "reject">("approve");
const reviewJobId = ref("");
const reviewNote = ref("");
const actingId = ref<string | null>(null);
const actingType = ref<"approve" | "reject" | null>(null);

const dialogTitle = computed(() =>
  dialogAction.value === "approve" ? "通过审核" : "驳回审核"
);

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("zh-CN");
}

async function fetchReviews() {
  loading.value = true;
  try {
    const res = await listPendingReviews(projectId, page.value, limit.value);
    items.value = res.data ?? [];
    total.value = res.meta?.pagination?.total ?? items.value.length;
  } finally {
    loading.value = false;
  }
}

function onSizeChange() {
  page.value = 1;
  void fetchReviews();
}

function goDetail(jobId: string) {
  router.push({ name: "SeoFactoryJobDetail", params: { projectId, jobId } });
}

function openReviewDialog(jobId: string, action: "approve" | "reject") {
  reviewJobId.value = jobId;
  dialogAction.value = action;
  reviewNote.value = "";
  dialogVisible.value = true;
}

async function submitReview() {
  actingId.value = reviewJobId.value;
  actingType.value = dialogAction.value;
  try {
    const note = reviewNote.value.trim() || undefined;
    if (dialogAction.value === "approve") {
      await approveArticleReview(projectId, reviewJobId.value, note);
      message("已通过审核，HTML 导出已生成", { type: "success" });
    } else {
      await rejectArticleReview(projectId, reviewJobId.value, note);
      message("已驳回审核", { type: "warning" });
    }
    dialogVisible.value = false;
    await fetchReviews();
  } finally {
    actingId.value = null;
    actingType.value = null;
  }
}

onMounted(() => {
  void fetchReviews();
});
</script>
