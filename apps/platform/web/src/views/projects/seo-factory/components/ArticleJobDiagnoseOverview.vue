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
          type="primary"
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
          重新优化
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
        <span v-if="item.badge != null" class="job-diagnose-overview__nav-badge">{{ item.badge }}</span>
      </button>
    </nav>
  </header>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ArticleJobItem } from "@/api/seo-factory/types";
import { buildJobDetailSummary } from "@/utils/seo-factory/job-detail-summary";
import { countSeoIssueItems, countSeoSuggestions } from "@/utils/seo-factory/job-seo-issues";

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

const verdictTitle = computed(() => {
  const local = props.localSeoScore ?? summary.value.localScore;
  const semrush = summary.value.semrushScore;
  const parts: string[] = [];
  if (local != null) {
    parts.push(`本地 ${local}/100${summary.value.localPassed ? " 达标" : " 待提升"}`);
  }
  if (semrush != null) {
    parts.push(`Semrush ${semrush}/10${summary.value.semrushPassed ? " 达标" : " 待提升"}`);
  }
  return parts.length ? parts.join(" · ") : "暂无评分，请先生成正文";
});

const verdictDesc = computed(() => {
  if (issues.value > 0) {
    return `${issues.value} 项待修复${suggestions.value > 0 ? ` · ${suggestions.value} 条优化建议` : ""}，优先处理待修复项`;
  }
  if (suggestions.value > 0) {
    return `${suggestions.value} 条优化建议，可按需微调`;
  }
  if (summary.value.hasDraftContent) {
    return "暂无待修复项，可导出或发布";
  }
  return "正文生成后可查看完整诊断";
});

const verdictIcon = computed(() =>
  issues.value > 0 ? "ri:alert-line" : summary.value.hasDraftContent ? "ri:checkbox-circle-line" : "ri:information-line"
);

const verdictToneClass = computed(() => {
  if (issues.value > 0) return "is-warn";
  if (summary.value.localPassed && summary.value.semrushPassed) return "is-pass";
  return "is-info";
});

const navItems = computed(() => {
  const items: Array<{ id: DiagnoseSectionId; label: string; badge?: number | string }> = [
    { id: "fixes", label: "待修复", badge: issues.value || undefined },
    { id: "scores", label: "评分明细" },
    { id: "research", label: "竞品对标" }
  ];
  items.push({ id: "pipeline", label: "产线明细" });
  return items;
});
</script>
