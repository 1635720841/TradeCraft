<!--
  YMYL 内容审查结果展示。

  边界：
  - 不负责：审查逻辑（后端 content-review 模块）
-->
<template>
  <div>
    <el-alert
      v-if="!review"
      type="info"
      :closable="false"
      show-icon
      title="尚未完成 YMYL 审查"
      description="工作流在 Semrush 优化后会自动执行内容审查；若状态为「内容审查」请稍候刷新。"
    />

    <template v-else>
      <el-alert
        :type="review.requires_human_review ? 'warning' : 'success'"
        :closable="false"
        show-icon
        class="mb-4"
        :title="review.requires_human_review ? '需人工审核（YMYL）' : '未检测到 YMYL 敏感主题'"
        :description="summaryText"
      />

      <el-descriptions :column="1" border class="mb-4">
        <el-descriptions-item label="审查时间">
          {{ formatTime(review.reviewedAt) }}
        </el-descriptions-item>
        <el-descriptions-item label="敏感分类">
          <template v-if="review.categories.length">
            <el-tag
              v-for="category in review.categories"
              :key="category"
              class="mr-2"
              :type="dictTagType(ymylCategoryDict, category)"
            >
              {{ dictLabel(ymylCategoryDict, category) }}
            </el-tag>
          </template>
          <span v-else class="text-gray-500">无</span>
        </el-descriptions-item>
        <el-descriptions-item label="可自动导出 HTML">
          <el-tag :type="canAutoExport ? 'success' : 'danger'">
            {{ canAutoExport ? "允许" : "禁止" }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item v-if="review.requires_human_review" label="人工审核">
          <el-tag :type="dictTagType(ymylHumanReviewStatusDict, humanReviewStatus)">
            {{ dictLabel(ymylHumanReviewStatusDict, humanReviewStatus) }}
          </el-tag>
          <p v-if="review.humanReviewNote" class="mt-2 text-sm text-gray-600">
            备注：{{ review.humanReviewNote }}
          </p>
        </el-descriptions-item>
      </el-descriptions>

      <div v-if="review.matchedSignals.length" class="mb-2 font-medium">命中信号</div>
      <el-table
        v-if="review.matchedSignals.length"
        :data="signalRows"
        stripe
        size="small"
        class="mb-4"
      >
        <el-table-column prop="signal" label="匹配内容" min-width="280" />
      </el-table>

      <el-empty v-else description="无命中信号" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ArticleJobYmylReview } from "@/api/seo-factory/types";
import { ymylCategoryDict, ymylHumanReviewStatusDict } from "@/constants/dicts/seo-factory";
import { dictLabel, dictTagType } from "@/utils/dict";

defineOptions({ name: "ArticleJobYmylPanel" });

const props = defineProps<{
  ymylReview?: ArticleJobYmylReview | null;
}>();

const review = computed(() => props.ymylReview ?? null);

const humanReviewStatus = computed(
  () => review.value?.humanReviewStatus ?? (review.value?.requires_human_review ? "pending" : "approved")
);

const canAutoExport = computed(() => {
  if (!review.value?.requires_human_review) return true;
  return review.value.humanReviewStatus === "approved";
});

const signalRows = computed(() =>
  (review.value?.matchedSignals ?? []).map((signal) => ({ signal }))
);

const summaryText = computed(() => {
  if (!review.value) return "";
  if (!review.value.requires_human_review) {
    return "当前稿件未触发 YMYL 规则，后续导出模块将允许生成可发布 HTML。";
  }
  if (review.value.humanReviewStatus === "approved") {
    return "人工审核已通过，可下载 HTML 导出文件。";
  }
  if (review.value.humanReviewStatus === "rejected") {
    return "人工审核已驳回，请修改内容后重新生成。";
  }
  return "文章涉及医疗、金融、法律或安全等高影响主题，请前往「待审核」或通过下方操作完成人工复核。";
});

function formatTime(iso: string) {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return iso;
  return new Date(parsed).toLocaleString("zh-CN");
}
</script>
