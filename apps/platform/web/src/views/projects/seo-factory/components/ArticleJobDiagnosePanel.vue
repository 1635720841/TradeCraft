<!--
  优化诊断 Tab：结论总览 + 分区折叠，按运营优先级组织。

  边界：
  - 不负责：API 调用（事件上抛给 JobDetailView）
-->
<template>
  <div class="job-diagnose-panel">
    <ArticleJobDiagnoseOverview
      :job="job"
      :local-seo-score="localSeoScore"
      :active-section="activeSection"
      :can-check="canCheck"
      :checking="checking"
      :can-rewrite="canRewrite"
      :rewriting="rewriting"
      :can-rerun-optimization="canRerunOptimization"
      :rerunning-optimization="rerunningOptimization"
      @run-semrush-check="emit('run-semrush-check')"
      @cancel-semrush-check="emit('cancel-semrush-check')"
      @rewrite="emit('rewrite')"
      @rerun-optimization="emit('rerun-optimization')"
      @navigate="scrollToSection"
    />

    <ArticleJobRewriteResult
      v-if="rewriteCandidate"
      class="job-diagnose-panel__rewrite"
      :candidate="rewriteCandidate"
      :accepting="rewriteAccepting"
      :discarding="rewriteDiscarding"
      @accept="emit('accept-rewrite')"
      @discard="emit('discard-rewrite')"
    />

    <el-collapse v-model="expandedSections" class="job-diagnose-collapse">
      <el-collapse-item id="diagnose-fixes" name="fixes">
        <template #title>
          <span class="job-diagnose-collapse__title">待修复与建议</span>
          <span v-if="issueCount > 0" class="job-diagnose-collapse__hint">
            {{ issueCount }} 项待处理
          </span>
        </template>
        <ArticleJobSeoScorePanel
          section="fixes"
          :local-seo-score="localSeoScore"
          :semrush-score="job.semrushScore"
          :seo-check-data="job.seoCheckData"
          :local-pass-threshold="localPassThreshold"
          :semrush-pass-threshold="semrushPassThreshold"
        />
      </el-collapse-item>

      <el-collapse-item id="diagnose-scores" name="scores">
        <template #title>
          <span class="job-diagnose-collapse__title">评分明细</span>
          <span class="job-diagnose-collapse__hint">分项 · 指标 · 优化历史</span>
        </template>
        <ArticleJobSeoScorePanel
          section="scores"
          :local-seo-score="localSeoScore"
          :semrush-score="job.semrushScore"
          :seo-check-data="job.seoCheckData"
          :optimize-history="job.draftData?.optimizeHistory"
          :local-pass-threshold="localPassThreshold"
          :semrush-pass-threshold="semrushPassThreshold"
          :local-align-enabled="job.siteWorkflow?.scoreCalibrationLocalAlign === true"
          :local-score-stale="localScoreStale"
          :semrush-score-stale="semrushScoreStale"
          :optimizing-message="optimizingMessage"
        />
      </el-collapse-item>

      <el-collapse-item id="diagnose-research" name="research">
        <template #title>
          <span class="job-diagnose-collapse__title">竞品对标</span>
          <span v-if="benchmarkHint" class="job-diagnose-collapse__hint">{{ benchmarkHint }}</span>
        </template>
        <ArticleJobCompetitorCompareChart
          :serp-data="job.serpData"
          :brief-data="job.briefData"
          :draft-data="job.draftData"
          :seo-check-data="job.seoCheckData"
        />
        <ArticleJobCompetitorPanel
          :serp-data="job.serpData"
          :brief-data="job.briefData"
          :refreshing="serpRefreshing"
          :show-refresh-action="canRefreshSerp"
          @refresh="emit('refresh-serp', $event)"
        />
      </el-collapse-item>

      <el-collapse-item id="diagnose-pipeline" name="pipeline">
        <template #title>
          <span class="job-diagnose-collapse__title">产线明细</span>
          <span class="job-diagnose-collapse__hint">内链 · 配图 · 内容审查</span>
        </template>
        <el-segmented v-model="pipelineTab" :options="pipelineOptions" class="job-diagnose-pipeline-tabs" />
        <div class="job-diagnose-pipeline-body">
          <ArticleJobInternalLinksPanel
            v-if="pipelineTab === 'links'"
            :project-id="projectId"
            :job-id="jobId"
            :internal-links="job.draftData?.internalLinks"
            :internal-links-applied="job.draftData?.internalLinksApplied"
            @updated="emit('updated')"
          />
          <ArticleJobImagesPanel
            v-else-if="pipelineTab === 'images'"
            :article-images="job.draftData?.articleImages"
            :images-applied="job.draftData?.imagesApplied"
          />
          <ArticleJobYmylPanel
            v-else
            :ymyl-review="ymylReview"
          />
        </div>
      </el-collapse-item>
    </el-collapse>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { RefreshArticleJobSerpPayload } from "@/api/seo-factory/article-job";
import type {
  ArticleJobItem,
  ArticleJobRewriteCandidate,
  ArticleJobYmylReview
} from "@/api/seo-factory/types";
import { buildJobDetailSummary } from "@/utils/seo-factory/job-detail-summary";
import { countSeoIssueItems } from "@/utils/seo-factory/job-seo-issues";
import ArticleJobCompetitorCompareChart from "./ArticleJobCompetitorCompareChart.vue";
import ArticleJobCompetitorPanel from "./ArticleJobCompetitorPanel.vue";
import ArticleJobDiagnoseOverview, {
  type DiagnoseSectionId
} from "./ArticleJobDiagnoseOverview.vue";
import ArticleJobImagesPanel from "./ArticleJobImagesPanel.vue";
import ArticleJobInternalLinksPanel from "./ArticleJobInternalLinksPanel.vue";
import ArticleJobRewriteResult from "./ArticleJobRewriteResult.vue";
import ArticleJobSeoScorePanel from "./ArticleJobSeoScorePanel.vue";
import ArticleJobYmylPanel from "./ArticleJobYmylPanel.vue";

defineOptions({ name: "ArticleJobDiagnosePanel" });

const props = defineProps<{
  job: ArticleJobItem;
  projectId: string;
  jobId: string;
  localSeoScore?: number | null;
  localPassThreshold?: number;
  semrushPassThreshold?: number;
  localScoreStale?: boolean;
  semrushScoreStale?: boolean;
  canCheck?: boolean;
  checking?: boolean;
  checkStale?: boolean;
  optimizingMessage?: string;
  canRewrite?: boolean;
  rewriting?: boolean;
  rewriteBlockedReason?: string;
  canRerunOptimization?: boolean;
  rerunningOptimization?: boolean;
  serpRefreshing?: boolean;
  canRefreshSerp?: boolean;
  rewriteCandidate?: ArticleJobRewriteCandidate | null;
  rewriteAccepting?: boolean;
  rewriteDiscarding?: boolean;
  ymylReview?: ArticleJobYmylReview | null;
}>();

const emit = defineEmits<{
  updated: [];
  "run-semrush-check": [];
  "cancel-semrush-check": [];
  rewrite: [];
  "rerun-optimization": [];
  "refresh-serp": [payload?: RefreshArticleJobSerpPayload];
  "accept-rewrite": [];
  "discard-rewrite": [];
}>();

const expandedSections = ref<DiagnoseSectionId[]>(["fixes"]);
const activeSection = ref<DiagnoseSectionId>("fixes");
const pipelineTab = ref<"links" | "images" | "ymyl">("links");

const pipelineOptions = [
  { label: "内链", value: "links" },
  { label: "配图", value: "images" },
  { label: "内容审查", value: "ymyl" }
];

const issueCount = computed(() => countSeoIssueItems(props.job.seoCheckData));
const benchmarkHint = computed(() => buildJobDetailSummary(props.job).benchmarkLine);

function scrollToSection(section: DiagnoseSectionId) {
  activeSection.value = section;
  if (!expandedSections.value.includes(section)) {
    expandedSections.value = [...expandedSections.value, section];
  }
  if (section === "pipeline") {
    pipelineTab.value = "links";
  }
  requestAnimationFrame(() => {
    const anchorMap: Record<DiagnoseSectionId, string> = {
      fixes: "diagnose-fixes",
      scores: "diagnose-scores",
      research: "diagnose-research",
      pipeline: "diagnose-pipeline"
    };
    document.getElementById(anchorMap[section])?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  });
}

/** 兼容详情页深链：?tab=seo / ymyl / links / images */
function scrollToLegacySection(section: "seo" | "ymyl" | "links" | "images" | "research") {
  if (section === "seo") {
    scrollToSection("scores");
    return;
  }
  if (section === "research") {
    scrollToSection("research");
    return;
  }
  scrollToSection("pipeline");
  pipelineTab.value = section;
}

defineExpose({ scrollToLegacySection });
</script>
