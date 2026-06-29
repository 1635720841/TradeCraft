<!--
  任务详情成果摘要卡：分数、字数、对标结论与就绪状态。

  边界：
  - 不负责：评分计算（后端）
-->
<template>
  <section
    class="job-outcome-summary"
    :class="{ 'is-in-progress': summary.isInProgress }"
  >
    <template v-if="summary.isInProgress">
      <div class="job-outcome-summary__progress-card">
        <div class="job-outcome-summary__progress">
          <IconifyIconOnline
            icon="ri:loader-4-line"
            class="job-outcome-summary__progress-icon"
          />
          <div class="job-outcome-summary__progress-text">
            <span>生成产线</span>
            <strong>{{ summary.progressHeadline || "生成中…" }}</strong>
            <small v-if="summary.competitorSampleCount > 0">
              已参考 {{ summary.competitorSampleCount }} 条搜索样本
            </small>
          </div>
        </div>
        <div v-if="hasQuickStats" class="job-outcome-summary__quick-stats">
          <button
            v-if="summary.localScore != null"
            type="button"
            class="job-outcome-summary__stat-btn"
            @click="emit('go-section', 'seo')"
          >
            本地 SEO <strong>{{ summary.localScore }}</strong>
          </button>
          <button
            v-if="summary.wordCount != null"
            type="button"
            class="job-outcome-summary__stat-btn"
            @click="emit('go-diagnose')"
          >
            字数 <strong>{{ summary.wordCount }}</strong>
          </button>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="job-outcome-summary__grid">
        <div class="job-outcome-summary__hero">
          <span class="job-outcome-summary__kicker">
            <IconifyIconOnline :icon="outcomeIcon" />
            SEO 生成结果
          </span>
          <strong class="job-outcome-summary__title">{{ outcomeTitle }}</strong>
          <p class="job-outcome-summary__desc">{{ outcomeDesc }}</p>
          <el-tag
            v-if="summary.isCompleted"
            size="small"
            :type="releaseReady ? 'success' : 'warning'"
            class="job-outcome-summary__readiness"
          >
            {{ readinessLabel }}
          </el-tag>
          <p v-if="!releaseReady && readinessGap" class="job-outcome-summary__gap">
            {{ readinessGap }}
          </p>

          <div class="job-outcome-summary__scores">
            <button
              type="button"
              class="job-outcome-summary__score-ring"
              :class="summary.localPassed ? 'is-pass' : 'is-warn'"
              @click="emit('go-section', 'seo')"
            >
              <el-progress
                type="circle"
                :percentage="localPercent"
                :width="72"
                :stroke-width="6"
                :color="summary.localPassed ? '#15803d' : '#b45309'"
              >
                <template #default>
                  <span class="job-outcome-summary__ring-value">{{
                    summary.localScore ?? "—"
                  }}</span>
                </template>
              </el-progress>
              <span class="job-outcome-summary__ring-label">本地 SEO /100</span>
            </button>
            <button
              type="button"
              class="job-outcome-summary__score-ring"
              :class="summary.semrushPassed ? 'is-pass' : 'is-warn'"
              @click="emit('go-section', 'seo')"
            >
              <el-progress
                type="circle"
                :percentage="semrushPercent"
                :width="72"
                :stroke-width="6"
                :color="summary.semrushPassed ? '#15803d' : '#b45309'"
              >
                <template #default>
                  <span class="job-outcome-summary__ring-value">{{
                    summary.semrushScore ?? "—"
                  }}</span>
                </template>
              </el-progress>
              <span class="job-outcome-summary__ring-label">Semrush /10</span>
            </button>
          </div>
        </div>

        <div class="job-outcome-summary__proof">
          <div class="job-outcome-summary__section-head">
            <span>可信依据</span>
            <el-tooltip
              v-if="hasTdk"
              content="复制页面标题、Meta 描述和关键词"
              placement="top"
            >
              <button
                type="button"
                class="job-outcome-summary__text-btn"
                @click="copyTdk"
              >
                复制 TDK
              </button>
            </el-tooltip>
          </div>
          <div class="job-outcome-summary__proof-list">
            <button
              v-for="item in proofItems"
              :key="item.label"
              type="button"
              class="job-outcome-summary__proof-item"
              :class="`is-${item.tone}`"
              :disabled="!item.section"
              @click="item.section && emit('go-section', item.section)"
            >
              <IconifyIconOnline :icon="item.icon" />
              <span>{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
            </button>
          </div>
        </div>
      </div>

      <div class="job-outcome-summary__asset-row">
        <button
          v-for="item in assetItems"
          :key="item.label"
          type="button"
          class="job-outcome-summary__asset"
          @click="handleAssetClick(item.target)"
        >
          <IconifyIconOnline :icon="item.icon" />
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
        </button>
      </div>

      <div v-if="gscItems.length" class="job-outcome-summary__gsc-card">
        <div class="job-outcome-summary__gsc-head">
          <IconifyIconOnline icon="ri:line-chart-line" />
          <span>上线后搜索表现</span>
          <em>近 {{ job.gscPerformance?.periodDays }} 天</em>
        </div>
        <div class="job-outcome-summary__gsc-metrics">
          <span v-for="item in gscItems" :key="item.label">
            {{ item.label }}
            <strong>{{ item.value }}</strong>
          </span>
        </div>
      </div>

      <p v-if="summary.benchmarkLine" class="job-outcome-summary__benchmark">
        <button
          type="button"
          class="job-outcome-summary__benchmark-btn"
          @click="emit('go-section', 'research')"
        >
          {{ summary.benchmarkLine }}
        </button>
      </p>

      <div
        v-if="summary.readinessBadges.length"
        class="job-outcome-summary__badges"
      >
        <span
          v-for="(badge, i) in summary.readinessBadges"
          :key="i"
          class="job-outcome-summary__badge"
        >
          <IconifyIconOnline icon="ri:checkbox-circle-line" />
          {{ badge }}
        </span>
      </div>

      <div v-if="showActions" class="job-outcome-summary__actions">
        <el-button
          size="small"
          type="primary"
          plain
          @click="emit('go-diagnose')"
          >查看诊断详情</el-button
        >
        <el-button
          v-if="summary.isCompleted && summary.hasDraftContent"
          size="small"
          plain
          @click="emit('print-report')"
        >
          打印创作报告
        </el-button>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ArticleJobItem } from "@/api/seo-factory/types";
import { resolveDraftTitleAndMeta } from "@/utils/seo-factory/draft-edit-preview";
import {
  buildJobDetailSummary,
  type DiagnoseSection
} from "@/utils/seo-factory/job-detail-summary";
import {
  buildOutcomeSummaryDesc,
  countSeoIssueItems,
  isSeoReleaseReady
} from "@/utils/seo-factory/job-seo-issues";
import { resolveJobReleaseReadiness } from "@/utils/seo-factory/release-readiness";
import { message } from "@/utils/message";

defineOptions({ name: "ArticleJobOutcomeSummaryCard" });

const props = withDefaults(
  defineProps<{
    job: ArticleJobItem;
    showActions?: boolean;
  }>(),
  { showActions: true }
);

const emit = defineEmits<{
  "go-diagnose": [];
  "go-section": [section: DiagnoseSection];
  "print-report": [];
}>();

type ProofTone = "pass" | "warn" | "info";
type AssetTarget = "diagnose" | DiagnoseSection;

interface ProofItem {
  label: string;
  value: string;
  icon: string;
  tone: ProofTone;
  section?: DiagnoseSection;
}

interface AssetItem {
  label: string;
  value: string;
  icon: string;
  target: AssetTarget;
}

const summary = computed(() => buildJobDetailSummary(props.job));
const resolvedMeta = computed(() =>
  resolveDraftTitleAndMeta(props.job.draftData, props.job.briefData)
);
const issueCount = computed(() => countSeoIssueItems(props.job.seoCheckData));
const releaseReady = computed(() =>
  isSeoReleaseReady(summary.value.localPassed, summary.value.semrushPassed)
);
const releaseReadiness = computed(() => resolveJobReleaseReadiness(props.job));
const readinessLabel = computed(() => releaseReadiness.value.label);
const readinessGap = computed(() => releaseReadiness.value.gapText);
const hasTdk = computed(() =>
  Boolean(resolvedMeta.value.title && resolvedMeta.value.metaDescription)
);
const tdkKeywords = computed(() => {
  const keywords = [
    props.job.targetKeyword,
    ...(props.job.seoCheckData?.semrush?.submittedKeywords ?? [])
  ];
  return [...new Set(keywords.map(item => item?.trim()).filter(Boolean))];
});

const localPercent = computed(() => {
  if (summary.value.localScore == null) return 0;
  return Math.min(100, Math.round((summary.value.localScore / 100) * 100));
});

const semrushPercent = computed(() => {
  if (summary.value.semrushScore == null) return 0;
  return Math.min(100, Math.round((summary.value.semrushScore / 10) * 100));
});

const hasQuickStats = computed(
  () => summary.value.localScore != null || summary.value.wordCount != null
);

const outcomeIcon = computed(() => {
  if (summary.value.localPassed && summary.value.semrushPassed)
    return "ri:checkbox-circle-line";
  if (issueCount.value > 0) return "ri:alert-line";
  return "ri:file-list-3-line";
});

const outcomeTitle = computed(() => {
  if (summary.value.localPassed && summary.value.semrushPassed)
    return "已达到发布标准";
  if (summary.value.hasDraftContent && issueCount.value > 0)
    return "已生成，建议先处理优化项";
  if (summary.value.hasDraftContent) return "已生成，可进入发布检查";
  return "等待正文生成";
});

const outcomeDesc = computed(() =>
  buildOutcomeSummaryDesc({
    releaseReady: releaseReady.value,
    issueCount: issueCount.value,
    hasDraftContent: summary.value.hasDraftContent
  })
);

const reviewLabel = computed(() => {
  const review = props.job.seoCheckData?.ymylReview;
  if (!props.job.requiresHumanReview && !review?.requires_human_review)
    return "无需人工";
  if (review?.humanReviewStatus === "approved") return "已通过";
  if (review?.humanReviewStatus === "rejected") return "已驳回";
  return "待审核";
});

const proofItems = computed<ProofItem[]>(() => [
  {
    label: "竞品对标",
    value:
      summary.value.competitorSampleCount > 0
        ? `${summary.value.competitorSampleCount} 篇`
        : "待采集",
    icon: "ri:bar-chart-box-line",
    tone: summary.value.competitorSampleCount > 0 ? "pass" : "info",
    section: "research"
  },
  {
    label: "TDK",
    value: hasTdk.value ? "已生成" : "待补齐",
    icon: "ri:search-eye-line",
    tone: hasTdk.value ? "pass" : "warn"
  },
  {
    label: "JSON-LD",
    value: props.job.outputUrl ? "可导出" : "待导出",
    icon: "ri:braces-line",
    tone: props.job.outputUrl ? "pass" : "info"
  },
  {
    label: "原创表达",
    value: props.job.draftData?.paraphraseApplied ? "已优化" : "待优化",
    icon: "ri:fingerprint-line",
    tone: props.job.draftData?.paraphraseApplied ? "pass" : "info"
  },
  {
    label: "内容审查",
    value: reviewLabel.value,
    icon: "ri:shield-check-line",
    tone:
      reviewLabel.value === "已驳回" || reviewLabel.value === "待审核"
        ? "warn"
        : "pass",
    section: reviewLabel.value === "无需人工" ? undefined : "ymyl"
  }
]);

const assetItems = computed<AssetItem[]>(() => [
  {
    label: "正文词数",
    value: summary.value.wordCount != null ? `${summary.value.wordCount}` : "—",
    icon: "ri:file-text-line",
    target: "diagnose"
  },
  {
    label: "阅读时长",
    value:
      summary.value.readMinutes != null
        ? `${summary.value.readMinutes} 分钟`
        : "—",
    icon: "ri:time-line",
    target: "diagnose"
  },
  {
    label: "内链植入",
    value:
      summary.value.internalLinkCount != null
        ? `${summary.value.internalLinkCount}`
        : "—",
    icon: "ri:links-line",
    target: "links"
  },
  {
    label: "文章配图",
    value:
      summary.value.imageCount != null ? `${summary.value.imageCount}` : "—",
    icon: "ri:image-line",
    target: "images"
  }
]);

const gscItems = computed(() => {
  const gsc = props.job.gscPerformance;
  if (!gsc) return [];
  return [
    { label: "展现", value: String(gsc.impressions) },
    { label: "点击", value: String(gsc.clicks) },
    { label: "平均排名", value: gsc.position.toFixed(1) }
  ];
});

function handleAssetClick(target: AssetTarget) {
  if (target === "diagnose") {
    emit("go-diagnose");
    return;
  }
  emit("go-section", target);
}

async function copyTdk() {
  const text = [
    `Title: ${resolvedMeta.value.title}`,
    `Meta Description: ${resolvedMeta.value.metaDescription}`,
    `Keywords: ${tdkKeywords.value.join(", ")}`
  ].join("\n");
  try {
    await navigator.clipboard.writeText(text);
    message("TDK 已复制", { type: "success" });
  } catch {
    message("复制失败，请手动复制", { type: "error" });
  }
}
</script>
