<!--
  优化诊断总览：结论、操作、分区锚点。

  边界：
  - 不负责：评分计算与 API 调用
-->
<template>
  <header class="job-diagnose-overview">
    <div class="job-diagnose-overview__head">
      <div class="job-diagnose-overview__verdict">
        <IconifyIconOnline
          :icon="verdictIcon"
          class="job-diagnose-overview__verdict-icon"
          :class="verdictToneClass"
        />
        <div>
          <strong class="job-diagnose-overview__verdict-title">{{ verdictTitle }}</strong>
          <p class="job-diagnose-overview__verdict-desc">{{ verdictDesc }}</p>
        </div>
      </div>
      <div class="job-diagnose-overview__actions">
        <el-button
          :type="releaseReady ? 'default' : 'primary'"
          size="small"
          :loading="checking"
          :disabled="!canCheck || checking"
          @click="emit('run-semrush-check')"
        >
          Semrush 终检
        </el-button>
        <el-button v-if="checking" size="small" @click="emit('cancel-semrush-check')">
          取消
        </el-button>
        <el-button
          size="small"
          :disabled="!canRerunOptimization || rerunningOptimization"
          :loading="rerunningOptimization"
          @click="emit('rerun-optimization')"
        >
          {{ releaseReady ? "继续精修" : "重新优化" }}
        </el-button>
        <el-button
          size="small"
          :disabled="!canRewrite || rewriting"
          :loading="rewriting"
          @click="emit('rewrite')"
        >
          AI 重写
        </el-button>
      </div>
    </div>

    <nav class="job-diagnose-overview__nav" aria-label="诊断分区">
      <button
        v-for="item in navItems"
        :key="item.id"
        type="button"
        class="job-diagnose-overview__nav-item"
        :class="{ 'is-active': activeSection === item.id }"
        @click="emit('navigate', item.id)"
      >
        {{ item.label }}
        <span
          v-if="item.badge != null"
          class="job-diagnose-overview__nav-badge"
          :class="{ 'is-muted': item.badgeMuted }"
        >
          {{ item.badge }}
        </span>
      </button>
    </nav>
  </header>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ArticleJobItem } from "@/api/seo-factory/types";
import { buildJobDetailSummary } from "@/utils/seo-factory/job-detail-summary";
import {
  buildSeoVerdictDesc,
  buildSeoVerdictTitle,
  countSeoIssueItems,
  countSeoSuggestions,
  fixesNavLabel,
  isSeoReleaseReady
} from "@/utils/seo-factory/job-seo-issues";

export type DiagnoseSectionId = "fixes" | "scores" | "research" | "pipeline";

defineOptions({ name: "ArticleJobDiagnoseOverview" });

const props = defineProps<{
  job: ArticleJobItem;
  localSeoScore?: number | null;
  activeSection?: DiagnoseSectionId;
  issueCount?: number;
  suggestionCount?: number;
  canCheck?: boolean;
  checking?: boolean;
  canRewrite?: boolean;
  rewriting?: boolean;
  canRerunOptimization?: boolean;
  rerunningOptimization?: boolean;
}>();

const emit = defineEmits<{
  "run-semrush-check": [];
  "cancel-semrush-check": [];
  rewrite: [];
  "rerun-optimization": [];
  navigate: [section: DiagnoseSectionId];
}>();

const summary = computed(() => buildJobDetailSummary(props.job));

const issues = computed(
  () => props.issueCount ?? countSeoIssueItems(props.job.seoCheckData)
);
const suggestions = computed(
  () => props.suggestionCount ?? countSeoSuggestions(props.job.seoCheckData)
);

const releaseReady = computed(() =>
  isSeoReleaseReady(summary.value.localPassed, summary.value.semrushPassed)
);

const verdictTitle = computed(() =>
  buildSeoVerdictTitle({
    localScore: summary.value.localScore,
    semrushScore: summary.value.semrushScore,
    localPassed: summary.value.localPassed,
    semrushPassed: summary.value.semrushPassed,
    displayLocalScore: props.localSeoScore ?? summary.value.localScore
  })
);

const verdictDesc = computed(() =>
  buildSeoVerdictDesc({
    releaseReady: releaseReady.value,
    issueCount: issues.value,
    suggestionCount: suggestions.value,
    hasDraftContent: summary.value.hasDraftContent
  })
);

const verdictIcon = computed(() => {
  if (releaseReady.value) return "ri:checkbox-circle-line";
  if (issues.value > 0) return "ri:alert-line";
  return summary.value.hasDraftContent ? "ri:file-list-3-line" : "ri:information-line";
});

const verdictToneClass = computed(() => {
  if (releaseReady.value) return "is-pass";
  if (issues.value > 0) return "is-warn";
  return "is-info";
});

const navItems = computed(() => {
  const items: Array<{
    id: DiagnoseSectionId;
    label: string;
    badge?: number | string;
    badgeMuted?: boolean;
  }> = [];

  if (!releaseReady.value) {
    items.push({
      id: "fixes",
      label: fixesNavLabel(false),
      badge: issues.value || undefined
    });
  }

  items.push({ id: "scores", label: "评分明细" });
  items.push({ id: "research", label: "竞品对标" });
  items.push({ id: "pipeline", label: "产线明细" });
  return items;
});
</script>
