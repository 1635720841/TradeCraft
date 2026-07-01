<!--
  SEO 评分展示：Semrush 终检（权威）+ 本地预检。

  边界：
  - 不负责：评分计算（后端 seo-checker 模块）
-->
<template>
  <div class="seo-score-panel" :class="panelSectionClass">
    <div v-if="showToolbar" class="seo-score-panel__toolbar">
      <div class="seo-score-panel__actions">
        <el-button
          type="primary"
          size="small"
          :loading="checking"
          :disabled="!canRunSemrushCheck || checking"
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

      <div v-if="hasData" class="seo-score-panel__inline-scores">
        <span class="seo-score-pill">
          Semrush
          <strong :class="semrushScoreClass">
            {{ semrushSkipped ? "—" : semrushScore ?? "—" }}
          </strong>
          <em v-if="!semrushSkipped && semrushScore != null">/10</em>
        </span>
        <span class="seo-score-pill">
          {{ localGateCalibrated ? "预测" : "本地" }}
          <strong :class="localScoreClass">
            <template v-if="localGateCalibrated && predictedLocalSemrush != null">
              {{ predictedLocalSemrush }}
            </template>
            <template v-else>{{ localScore ?? "—" }}</template>
          </strong>
          <em>{{ localGateCalibrated && predictedLocalSemrush != null ? "/10" : localScore != null ? "/100" : "" }}</em>
        </span>
        <span v-if="contentScoreSummary" class="seo-score-pill">
          内容
          <strong
            :class="contentScoreSummary.passed ? 'seo-score-card__value--pass' : 'seo-score-card__value--warn'"
          >
            {{ contentScore?.overall ?? "—" }}
          </strong>
          <em>/10</em>
        </span>
      </div>

      <span
        class="seo-score-panel__status"
        :class="{ 'is-warn': Boolean(statusHint && statusHintWarn) }"
      >
        {{ statusHint || publishStandardTitle }}
      </span>
    </div>

    <div v-if="compactNotices.length && showNotices" class="seo-score-panel__notices">
      <div
        v-for="(notice, i) in compactNotices"
        :key="i"
        class="seo-score-notice seo-score-notice--compact"
        :class="`seo-score-notice--${notice.type}`"
      >
        <IconifyIconOnline :icon="noticeIcon(notice.type)" />
        <strong>{{ notice.title }}</strong>
        <span v-if="notice.description">{{ notice.description }}</span>
      </div>
    </div>

    <div v-if="hasData && showScoreBody" class="seo-score-panel__body">
      <div v-if="showLeftColumn" class="seo-score-panel__left">
        <div v-if="breakdownItems.length" class="seo-score-block">
          <div class="seo-score-block__head">本地预检分项</div>
          <div class="seo-score-block__body">
            <div class="seo-score-breakdown">
              <div
                v-for="item in breakdownItems"
                :key="item.key"
                class="seo-score-diamond-item"
              >
                <div
                  class="seo-score-diamond"
                  :class="breakdownBarClass(item)"
                >
                  <span class="seo-score-diamond__value">{{ item.value }}</span>
                </div>
                <span class="seo-score-diamond__label">{{ item.label }}</span>
                <span class="seo-score-diamond__max">满分 {{ item.max }}</span>
              </div>
            </div>
          </div>
        </div>

        <div v-if="hasMetricGroups" class="seo-score-block">
          <div class="seo-score-block__head">可读性与结构指标</div>
          <div class="seo-score-block__body">
            <div
              v-for="group in metricGroups"
              :key="group.key"
              class="seo-score-metric-group"
            >
              <div class="seo-score-metric-group__title">{{ group.title }}</div>
              <div class="seo-score-metrics">
                <div
                  v-for="item in group.items"
                  :key="item.key"
                  class="seo-score-metric"
                  :class="`is-${item.status}`"
                >
                  <div class="seo-score-metric__label">{{ item.label }}</div>
                  <div class="seo-score-metric__value">{{ item.value }}</div>
                  <div v-if="item.target" class="seo-score-metric__target">
                    目标 {{ item.target }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="showRightColumn" class="seo-score-panel__right">
        <div class="seo-score-block">
          <el-tabs v-model="detailTab" class="seo-score-detail-tabs">
            <el-tab-pane v-if="!releaseReady" :label="issuesTabTitle" name="issues">
              <div class="seo-score-scroll">
                <p v-if="releaseReady && issueGroups.length" class="seo-issue-polish-note">
                  评分已达标，以下为可选精修项，不影响发布。
                </p>
                <template v-if="issueGroups.length">
                  <div
                    v-for="group in issueGroups"
                    :key="group.kind"
                    class="seo-issue-group"
                    :class="`is-${group.severity}`"
                  >
                    <div class="seo-issue-group__head">
                      <IconifyIconOnline :icon="severityIcon(group.severity)" />
                      <span class="seo-issue-group__kind">{{ group.kind }}</span>
                      <span class="seo-issue-group__count">{{ group.items.length }}</span>
                      <span v-if="group.hint" class="seo-issue-group__hint">{{ group.hint }}</span>
                    </div>
                    <ul class="seo-issue-group__list">
                      <li v-for="(issue, i) in group.items" :key="i" class="seo-issue-line">
                        <span v-if="issue.meta" class="seo-issue-line__meta">{{ issue.meta }}</span>
                        <span class="seo-issue-line__text">{{ issue.text }}</span>
                      </li>
                    </ul>
                  </div>
                </template>
                <div v-else class="seo-score-panel__empty-hint">
                  <IconifyIconOnline icon="ri:checkbox-circle-line" />
                  <span>{{ emptyIssuesLabel }}</span>
                </div>
              </div>
            </el-tab-pane>
            <el-tab-pane
              v-if="!releaseReady"
              :label="`优化建议${suggestionCount ? ` (${suggestionCount})` : ''}`"
              name="suggestions"
            >
              <div class="seo-score-scroll">
                <template v-if="suggestionGroups.length">
                  <div
                    v-for="section in suggestionGroups"
                    :key="section.key"
                    class="seo-suggest-section"
                  >
                    <div class="seo-suggest-section__head">
                      <IconifyIconOnline :icon="suggestionIcon(section.key)" />
                      <span>{{ section.label }}</span>
                      <span class="seo-suggest-section__count">{{ section.count }}</span>
                    </div>
                    <template v-for="(block, bi) in section.blocks" :key="bi">
                      <ul
                        v-if="block.kind === 'directives'"
                        class="seo-score-suggest-list"
                      >
                        <li v-for="(t, i) in block.texts" :key="i">{{ t }}</li>
                      </ul>
                      <div v-else-if="block.kind === 'quotes'" class="seo-suggest-subblock">
                        <div class="seo-suggest-sub">{{ block.title }}</div>
                        <ul class="seo-quote-list">
                          <li v-for="(t, i) in block.texts" :key="i">{{ t }}</li>
                        </ul>
                      </div>
                      <div v-else class="seo-suggest-subblock">
                        <div class="seo-suggest-sub">{{ block.title }}</div>
                        <div class="seo-kw-chips">
                          <span
                            v-for="(c, ci) in block.chips"
                            :key="ci"
                            class="seo-kw-chip"
                            :class="c.level != null ? `freq-${c.level}` : ''"
                          >
                            {{ c.text }}
                            <em v-if="c.freqLabel">{{ c.freqLabel }}</em>
                          </span>
                          <span v-if="block.more" class="seo-kw-chip is-more">
                            {{ block.more }}
                          </span>
                        </div>
                      </div>
                    </template>
                  </div>
                </template>
                <ul v-else-if="allSuggestions.length" class="seo-score-suggest-list">
                  <li v-for="(s, i) in allSuggestions" :key="i">{{ s }}</li>
                </ul>
                <div v-else class="seo-score-panel__empty-hint">
                  <IconifyIconOnline icon="ri:checkbox-circle-line" />
                  <span>暂无评分建议</span>
                </div>
              </div>
            </el-tab-pane>
          </el-tabs>
        </div>
      </div>
    </div>

    <div
      v-if="showFooter && hasData && (optimizeScoreRows.length || optimizeHistory.length)"
      class="seo-score-panel__footer"
    >
      <el-collapse v-model="footerPanels">
        <el-collapse-item
          v-if="optimizeScoreRows.length"
          title="优化轮次评分"
          name="rounds"
        >
          <el-table :data="optimizeScoreRows" size="small" border stripe max-height="240">
            <el-table-column label="阶段" width="88">
              <template #default="{ row }">
                <el-tag :type="phaseTagType(row.phase)" size="small">
                  {{ phaseLabel(row.phase) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="轮次" width="88" prop="roundLabel" />
            <el-table-column label="前" width="72">
              <template #default="{ row }">{{ formatRowScore(row, "before") }}</template>
            </el-table-column>
            <el-table-column label="后" width="72">
              <template #default="{ row }">
                <span :class="scoreDeltaClass(getRowDelta(row))">
                  {{ formatRowScore(row, "after") }}
                </span>
              </template>
            </el-table-column>
            <el-table-column v-if="showPredictedOptimizeScores" label="预测" width="88">
              <template #default="{ row }">{{ formatRowPredictedScore(row, "after") }}</template>
            </el-table-column>
            <el-table-column label="变化" width="72">
              <template #default="{ row }">
                <span v-if="getRowDelta(row) != null" :class="scoreDeltaClass(getRowDelta(row))">
                  {{ formatDelta(getRowDelta(row)!) }}
                </span>
                <span v-else class="text-gray-400">-</span>
              </template>
            </el-table-column>
            <el-table-column label="时间" min-width="120">
              <template #default="{ row }">
                <span class="text-xs text-gray-500">{{ formatRowTime(row) }}</span>
              </template>
            </el-table-column>
          </el-table>
        </el-collapse-item>

        <el-collapse-item
          v-if="optimizeHistory.length"
          :title="`AI 优化记录 (${optimizeHistory.length})`"
          name="history"
        >
          <el-collapse v-model="activeOptimizePanels" class="border-0">
            <el-collapse-item
              v-for="item in optimizeHistory"
              :key="`${item.phase}-${item.round}-${item.optimizedAt}`"
              :name="`${item.phase}-${item.round}-${item.optimizedAt}`"
            >
              <template #title>
                <div class="flex flex-wrap items-center gap-2 pr-2 text-sm">
                  <el-tag :type="phaseTagType(item.phase)" size="small">
                    {{ phaseLabel(item.phase) }}
                  </el-tag>
                  <span>
                    {{ item.kind === "baseline" || item.round === 0
                      ? (item.phase === "local" ? "初稿" : "Semrush 初检")
                      : `第 ${item.round} 轮` }}
                  </span>
                  <el-tag
                    v-if="item.scoreBefore != null || item.scoreAfter != null"
                    size="small"
                    effect="plain"
                  >
                    {{ formatRoundScore(item.scoreBefore, item.phase) }}
                    →
                    {{ formatRoundScore(item.scoreAfter, item.phase) }}
                  </el-tag>
                  <el-tag v-if="item.rolledBack" type="warning" size="small" effect="plain">
                    已回滚
                  </el-tag>
                  <span class="text-xs text-gray-400">{{ formatTime(item.optimizedAt) }}</span>
                </div>
              </template>

              <div v-if="item.rolledBack" class="mb-2 text-sm text-gray-600">
                {{ formatRollbackDetail(item) }}
              </div>
              <div v-if="item.breakdownAfter" class="mb-2 flex flex-wrap gap-1">
                <el-tag size="small" type="info">关键词 {{ item.breakdownAfter.keywordCoverage }}</el-tag>
                <el-tag size="small" type="info">搜索词 {{ item.breakdownAfter.serpTermAlignment }}</el-tag>
                <el-tag size="small" type="info">结构 {{ item.breakdownAfter.structure }}</el-tag>
                <el-tag size="small" type="info">可读 {{ item.breakdownAfter.readability }}</el-tag>
                <el-tag size="small" type="info">深度 {{ item.breakdownAfter.contentDepth }}</el-tag>
              </div>
              <ul v-if="item.changesSummary?.length" class="seo-score-suggest-list mb-2">
                <li v-for="(line, i) in item.changesSummary" :key="i">{{ line }}</li>
              </ul>
              <ul v-if="item.warnings?.length" class="seo-score-suggest-list text-amber-800">
                <li v-for="(line, i) in item.warnings" :key="i">{{ line }}</li>
              </ul>
            </el-collapse-item>
          </el-collapse>
        </el-collapse-item>
      </el-collapse>
    </div>

    <ArticleJobSeoAnalysisSnapshotsPanel v-if="showSnapshots" :snapshots="analysisSnapshots" />

    <el-empty
      v-if="!hasData && !canCheck && sectionMode === 'full'"
      description="暂无 SEO 评分（任务尚未进入优化阶段）"
    />
    <el-empty
      v-else-if="!hasData && sectionMode === 'fixes'"
      :description="fixesEmptyDescriptionLabel"
    />
    <el-empty
      v-else-if="!hasData && sectionMode === 'scores'"
      description="暂无评分明细"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type {
  ArticleJobOptimizeRound,
  ArticleJobSeoCheckData
} from "@/api/seo-factory/types";
import {
  LOCAL_SEO_PASS_THRESHOLD,
  SEMRUSH_PASS_THRESHOLD,
  SCORE_CALIBRATION_LOCAL_ALIGN_SOFT_PASS_MARGIN,
  SCORE_CALIBRATION_HIGH_LOCAL_SOFT_PASS_MARGIN
} from "@/constants/seo-factory";
import { workflowStepLabel } from "@/utils/seo-factory/workflow-progress";
import {
  emptyIssuesHint,
  fixesEmptyDescription,
  isSeoReleaseReady,
  issuesTabLabel
} from "@/utils/seo-factory/job-seo-issues";
import { useSeoIssueGroups } from "@/composables/seo-factory/useSeoIssueGroups";
import ArticleJobSeoAnalysisSnapshotsPanel from "./seo/ArticleJobSeoAnalysisSnapshotsPanel.vue";

defineOptions({ name: "ArticleJobSeoScorePanel" });

const props = defineProps<{
  localSeoScore?: number | null;
  semrushScore?: number | null;
  seoCheckData?: ArticleJobSeoCheckData | null;
  optimizeHistory?: ArticleJobOptimizeRound[] | null;
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
  localPassThreshold?: number;
  semrushPassThreshold?: number;
  /** 站点已开启本地对齐 Sem（实际生效见 seoCheck.local.gateMode） */
  localAlignEnabled?: boolean;
  /** full=详情默认；fixes=仅待修复/建议；scores=仅分项与历史 */
  section?: "full" | "fixes" | "scores";
}>();

const localPassThreshold = computed(
  () => props.localPassThreshold ?? LOCAL_SEO_PASS_THRESHOLD
);
const semrushPassThreshold = computed(
  () => props.semrushPassThreshold ?? SEMRUSH_PASS_THRESHOLD
);

const semrushPassed = computed(
  () => props.semrushScore != null && props.semrushScore >= semrushPassThreshold.value
);

const emit = defineEmits<{
  "run-semrush-check": [];
  "cancel-semrush-check": [];
  rewrite: [];
  "rerun-optimization": [];
}>();

const sectionMode = computed(() => props.section ?? "full");
const showToolbar = computed(() => sectionMode.value === "full");
const showLeftColumn = computed(
  () => sectionMode.value === "full" || sectionMode.value === "scores"
);
const showRightColumn = computed(
  () => sectionMode.value === "full" || sectionMode.value === "fixes"
);
const showScoreBody = computed(() => showLeftColumn.value || showRightColumn.value);
const showFooter = computed(
  () => sectionMode.value === "full" || sectionMode.value === "scores"
);
const showSnapshots = computed(
  () => sectionMode.value === "full" || sectionMode.value === "scores"
);
const showNotices = computed(
  () => sectionMode.value === "full" || sectionMode.value === "fixes"
);
const panelSectionClass = computed(() => {
  if (sectionMode.value === "fixes") return "is-section-fixes";
  if (sectionMode.value === "scores") return "is-section-scores";
  return "";
});

const local = computed(() => props.seoCheckData?.local);
const semrush = computed(() => props.seoCheckData?.semrush);
const contentScore = computed(() => props.seoCheckData?.contentScore);
const analysisSnapshots = computed(() => props.seoCheckData?.analysisSnapshots ?? []);
const manualCheckWarning = computed(() => semrush.value?.lastManualCheckError?.trim() || null);
const workflowProgress = computed(() => props.seoCheckData?.workflowProgress);

const failedStepLabel = computed(() => {
  const step = props.seoCheckData?.workflow?.failedStep;
  return step ? workflowStepLabel(step) : null;
});

const localScore = computed(() => {
  const candidates = [
    props.localSeoScore,
    local.value?.score,
    workflowProgress.value?.localScore,
  ].filter((v): v is number => typeof v === "number");
  if (candidates.length === 0) return null;
  return Math.max(...candidates);
});

const contentScoreSummary = computed(() => {
  const snap = contentScore.value;
  if (!snap) return null;
  const sourceLabel =
    snap.source === "draft_editor"
      ? "改稿评分"
      : snap.source === "m6_proxy"
        ? "M6 代理分"
        : "流水线评分";
  return {
    passed: snap.passed,
    title: `内容评分 ${snap.overall} / 10（${sourceLabel}）`,
    description: snap.passed
      ? `已达发布线 · ${snap.primaryNode.label} · ${snap.confidence} 置信`
      : `还差 ${snap.pointsToGo} 分 · 当前重点：${snap.primaryNode.label}`
  };
});

const localGateCalibrated = computed(
  () =>
    local.value?.gateMode === "calibrated" ||
    (props.localAlignEnabled === true && contentScore.value != null)
);
const predictedLocalSemrush = computed(() => {
  if (local.value?.predictedSemrush != null) return local.value.predictedSemrush;
  if (localGateCalibrated.value && contentScore.value?.overall != null) {
    return contentScore.value.overall;
  }
  return null;
});
const localBreakdownStale = computed(() => {
  const score = localScore.value;
  const persisted = local.value?.score;
  if (score == null || persisted == null) return false;
  return score >= localPassThreshold.value && score > persisted;
});
const localPassed = computed(() => {
  if (localGateCalibrated.value && predictedLocalSemrush.value != null) {
    return predictedLocalSemrush.value >= semrushPassThreshold.value;
  }
  if (localScore.value != null) {
    return localScore.value >= localPassThreshold.value;
  }
  if (local.value?.passed != null) return local.value.passed;
  return null;
});
const releaseReady = computed(() =>
  isSeoReleaseReady(Boolean(localPassed.value), semrushPassed.value)
);
const { issueItems, issueGroups, severityIcon } = useSeoIssueGroups(
  () => props.seoCheckData,
  releaseReady
);
const issuesTabTitle = computed(() => issuesTabLabel(releaseReady.value, issueItems.value.length));
const emptyIssuesLabel = computed(() => emptyIssuesHint(releaseReady.value));
const fixesEmptyDescriptionLabel = computed(() => fixesEmptyDescription(releaseReady.value));
const localPassedForSemrush = computed(() => {
  if (localGateCalibrated.value && predictedLocalSemrush.value != null) {
    if (predictedLocalSemrush.value >= semrushPassThreshold.value) return true;
    if (
      predictedLocalSemrush.value >=
      semrushPassThreshold.value - SCORE_CALIBRATION_LOCAL_ALIGN_SOFT_PASS_MARGIN
    ) {
      return true;
    }
    if (
      (localScore.value ?? 0) >= localPassThreshold.value &&
      predictedLocalSemrush.value >=
        semrushPassThreshold.value - SCORE_CALIBRATION_HIGH_LOCAL_SOFT_PASS_MARGIN
    ) {
      return true;
    }
  }
  return localPassed.value;
});
const localGateDisplayPassed = computed(() => {
  if (localGateCalibrated.value && predictedLocalSemrush.value != null) {
    return localPassedForSemrush.value;
  }
  return localPassed.value;
});
const localGatePassedLabel = computed(() => {
  if (
    localGateCalibrated.value &&
    predictedLocalSemrush.value != null &&
    predictedLocalSemrush.value < semrushPassThreshold.value &&
    localPassedForSemrush.value
  ) {
    return "可进 RPA（软放行）";
  }
  return "已通过";
});
const calibratedScoreGapHint = computed(() => {
  if (!localGateCalibrated.value || predictedLocalSemrush.value == null || localScore.value == null) {
    return "";
  }
  if (localScore.value < 90 || predictedLocalSemrush.value >= semrushPassThreshold.value) {
    return "";
  }
  const parts = [
    `规则分 ${localScore.value}/100 与预测 Semrush ${predictedLocalSemrush.value}/10 是两套评分，进门闸只看预测分（实验室校准模型），不是规则分÷10。`
  ];
  const flesch = metrics.value?.fleschReadingEase;
  if (flesch != null && flesch < 42) {
    parts.push(`Flesch ${flesch} 低于 Sem 目标 50±8，是预测分长期卡在 9 以下的主因；优化轮次以提升预测分为验收，规则分 99 仍可能回滚。`);
  } else if (localPointsToGo.value > 0) {
    parts.push(`还差 ${localPointsToGo.value} 分达标；规则分已满时，请优先 Flesch / 难读句 / SERP 实体。`);
  }
  return parts.join("");
});
const localPointsToGo = computed(() => {
  if (localGateCalibrated.value && predictedLocalSemrush.value != null) {
    if (predictedLocalSemrush.value >= semrushPassThreshold.value) return 0;
    return Math.round((semrushPassThreshold.value - predictedLocalSemrush.value) * 10) / 10;
  }
  if (localScore.value == null || localScore.value >= localPassThreshold.value) return 0;
  return localPassThreshold.value - localScore.value;
});

const localNearMiss = computed(() => {
  if (localPassed.value === true) return false;
  if (localGateCalibrated.value && predictedLocalSemrush.value != null) {
    return localPointsToGo.value > 0 && localPointsToGo.value <= 1;
  }
  return localPointsToGo.value > 0 && localPointsToGo.value <= 5 && localScore.value != null;
});

const localNearMissTitle = computed(() => {
  if (localGateCalibrated.value && predictedLocalSemrush.value != null) {
    return `预测 Semrush ${predictedLocalSemrush.value}/10，距 ${semrushPassThreshold.value} 还差 ${localPointsToGo.value} 分（规则分 ${localScore.value ?? "—"}/100 仅参考）`;
  }
  return `本地预检 ${localScore.value} 分，距 ${localPassThreshold.value} 分还差 ${localPointsToGo.value} 分`;
});

const localNearMissHint = computed(() => {
  const parts: string[] = [];
  const m = metrics.value;
  if (m?.longSentencesOver22 != null && m.longSentencesOver22 > 2) {
    parts.push(`超长句 ${m.longSentencesOver22} 条（须 ≤2）`);
  }
  if (m?.longParagraphsOver65 != null && m.longParagraphsOver65 > 1) {
    parts.push(`超长段 ${m.longParagraphsOver65} 段（须 ≤1）`);
  }
  if (m?.passiveVoiceHits != null && m.passiveVoiceHits > 6) {
    parts.push(`被动语态 ${m.passiveVoiceHits} 处（须 ≤6）`);
  }
  if (parts.length > 0) {
    return `优先修复：${parts.join("；")}。重新生成将自动追加优化轮次。`;
  }
  return "请按下方「本地评分建议」逐项修复，或点「重新生成」继续自动优化。";
});

const semrushScore = computed(() => props.semrushScore ?? semrush.value?.overall ?? null);

const semrushPointsToGo = computed(() => {
  if (semrushScore.value == null || semrushScore.value >= semrushPassThreshold.value) return 0;
  return Math.round((semrushPassThreshold.value - semrushScore.value) * 10) / 10;
});

const semrushNearMiss = computed(
  () =>
    !semrushSkipped.value &&
    semrushScore.value != null &&
    semrushScore.value >= Math.max(0, semrushPassThreshold.value - 1) &&
    semrushScore.value < semrushPassThreshold.value,
);

const semrushSkipped = computed(() => semrush.value?.skipped === true);

const publishStandardTitle = computed(() => {
  if (semrushSkipped.value) {
    return localGateCalibrated.value
      ? `发布标准：预测 Semrush ≥ ${semrushPassThreshold.value} 分（Semrush 未启用）`
      : `发布标准：本地预检 ≥ ${localPassThreshold.value} 分（Semrush 未启用）`;
  }
  if (localGateCalibrated.value) {
    return `评分流程：预测 Semrush ≥ ${semrushPassThreshold.value} 分（本地对齐）→ Semrush RPA 终检 ≥ ${semrushPassThreshold.value} 分`;
  }
  return `评分流程：本地预检 ≥ ${localPassThreshold.value} 分 → Semrush 终检 ≥ ${semrushPassThreshold.value} 分`;
});

const publishStandardDescription = computed(() => {
  if (semrushSkipped.value) {
    return "当前环境未配置 Semrush RPA，达到本地预检门槛后即可导出与推送 CMS。若日后启用 Semrush，终检分将成为额外权威门槛。";
  }
  if (localGateCalibrated.value) {
    return "本地进门闸已对齐 Semrush：用实验室校准模型预测 Semrush 分，与终检同一通过线；RPA 真分仍为最终权威。";
  }
  return "本地预检为进门闸（规则 0–100）；Semrush 终检为权威分，任务是否通过以此为准。";
});

const optimizeRounds = computed(() => local.value?.optimizeRounds);
const semrushOptimizeRounds = computed(() => semrush.value?.optimizeRounds);
const metrics = computed(() => local.value?.metrics);
const semrushCheckRecordLabel = computed(() => {
  const rec = semrush.value?.semrushCheckRecord;
  if (!rec) return "";
  const parts = [`hash:${rec.contentHash}`];
  if (rec.nodeKey) parts.push(`节点:${rec.nodeKey}`);
  if (rec.domScore != null) parts.push(`DOM:${rec.domScore}`);
  if (rec.apiScore != null) parts.push(`API:${rec.apiScore}`);
  if (rec.checkedAt) parts.push(formatTime(rec.checkedAt));
  return parts.join(" · ");
});
const breakdown = computed(() => local.value?.breakdown);
const localSuggestions = computed(() => local.value?.suggestions ?? []);
const semrushSuggestions = computed(() => semrush.value?.suggestions ?? []);
const semrushNode = computed(
  () => semrush.value?.nodeLabel ?? semrush.value?.node ?? null,
);
const semrushEvaluationRoute = computed(
  () => semrush.value?.semrushEvaluationRoute ?? null,
);
const semrushEvaluationContentFingerprint = computed(
  () => semrush.value?.semrushEvaluationContentFingerprint ?? null,
);
const submittedKeywords = computed(() => semrush.value?.submittedKeywords ?? []);
const semrushReadabilityScore = computed(
  () => semrush.value?.semrushReadabilityScore ?? null
);
const semrushWordCountLabel = computed(() => {
  const current = semrush.value?.semrushCurrentWordCount;
  const competitor = semrush.value?.semrushCompetitorWordCount;
  if (current == null && competitor == null) return "";
  if (current != null && competitor != null) {
    return `当前 ${current} 词 · 竞品标杆 ${competitor} 词`;
  }
  if (current != null) return `当前约 ${current} 词`;
  return `竞品标杆约 ${competitor} 词`;
});

const semrushWordGap = computed(() => {
  const current = semrush.value?.semrushCurrentWordCount;
  const competitor = semrush.value?.semrushCompetitorWordCount;
  if (typeof current !== "number" || typeof competitor !== "number") return null;
  return competitor - current;
});

const semrushWordGapClass = computed(() => {
  const gap = semrushWordGap.value;
  if (gap == null) return "";
  if (gap > 150) return "text-red-700 font-medium";
  if (gap > 60) return "text-amber-700 font-medium";
  if (gap >= 0) return "text-gray-700";
  return "text-amber-700";
});
const analysisSource = computed(() => semrush.value?.analysisSource ?? null);
const analysisSourceLabel = computed(() => {
  const src = analysisSource.value;
  if (src === "api") return "Semrush 接口";
  if (src === "dom") return "页面侧栏";
  if (src === "mixed") return "接口 + 页面";
  return src ?? "-";
});

const semrushSuggestionSections = computed(() => {
  const details = semrush.value?.suggestionDetails;
  if (!details) return [];
  const sections = [
    { key: "readability", label: "可读性", items: details.readability ?? [] },
    { key: "seo", label: "SEO", items: details.seo ?? [] },
    { key: "tone", label: "语气", items: details.tone ?? [] },
    { key: "originality", label: "原创性", items: details.originality ?? [] },
  ];
  return sections.filter((s) => s.items.length > 0);
});

/* —— 优化建议：纯前端解析重排（不改后端数据/评分） —— */
const FREQ_LINE_RE = /^(目标关键词|推荐关键词)「(.+?)」\s*Semrush\s*建议频次[:：]\s*(.+)$/;
const KEYWORD_LIST_RE = /^(.+?关键词[^:：]*)[:：]\s*(.+)$/;
const FREQ_META: Record<string, { level: number; label: string }> = {
  high: { level: 3, label: "高频" },
  medium: { level: 2, label: "中频" },
  low: { level: 1, label: "低频" },
  "very low": { level: 0, label: "极低频" }
};

function resolveFreq(freq: string): { level: number; label: string } {
  return FREQ_META[freq.trim().toLowerCase()] ?? { level: 1, label: freq.trim() };
}

function hasCjk(text: string): boolean {
  return /[\u4e00-\u9fa5]/.test(text);
}

function parseKeywordList(listStr: string): { keywords: string[]; more?: string } {
  const keywords: string[] = [];
  let more: string | undefined;
  for (let kw of listStr.split(/[,，、]/).map((s) => s.trim()).filter(Boolean)) {
    const dengMatch = kw.match(/^(.*?)\s*等\s*(\d+)\s*个$/);
    if (dengMatch) {
      if (dengMatch[1].trim()) keywords.push(dengMatch[1].trim());
      more = `等 ${dengMatch[2]} 个`;
      continue;
    }
    if (kw === "…" || kw === "...") {
      more = more ?? "更多";
      continue;
    }
    if (kw.endsWith("…")) {
      kw = kw.slice(0, -1).trim();
      if (kw) keywords.push(kw);
      more = more ?? "更多…";
      continue;
    }
    keywords.push(kw);
  }
  return { keywords, more };
}

interface SuggestChip {
  text: string;
  level?: number;
  freqLabel?: string;
}

interface SuggestBlock {
  kind: "directives" | "keywords" | "freq" | "quotes";
  title?: string;
  texts?: string[];
  chips?: SuggestChip[];
  more?: string;
}

interface SuggestionGroup {
  key: string;
  label: string;
  count: number;
  blocks: SuggestBlock[];
}

const suggestionGroups = computed((): SuggestionGroup[] =>
  semrushSuggestionSections.value
    .map((section): SuggestionGroup => {
      const directives: string[] = [];
      const quotes: string[] = [];
      const seenDirective = new Set<string>();
      const seenQuote = new Set<string>();
      const keywordListMap = new Map<string, { keywords: string[]; more?: string }>();
      const freqMap = new Map<string, SuggestChip & { scope: string }>();

      for (const raw of section.items) {
        const item = raw.trim();
        if (!item) continue;

        const fm = FREQ_LINE_RE.exec(item);
        if (fm) {
          const scope = fm[1];
          const keyword = fm[2];
          const { level, label } = resolveFreq(fm[3]);
          const k = `${scope}|${keyword}`;
          if (!freqMap.has(k)) {
            freqMap.set(k, { scope, text: keyword, level, freqLabel: label });
          }
          continue;
        }

        const km = KEYWORD_LIST_RE.exec(item);
        if (km && /关键词/.test(km[1])) {
          const label = km[1].trim();
          const parsed = parseKeywordList(km[2]);
          const existing = keywordListMap.get(label);
          if (!existing || parsed.keywords.length > existing.keywords.length) {
            keywordListMap.set(label, parsed);
          }
          continue;
        }

        if (hasCjk(item)) {
          if (!seenDirective.has(item)) {
            seenDirective.add(item);
            directives.push(item);
          }
        } else if (!seenQuote.has(item)) {
          seenQuote.add(item);
          quotes.push(item);
        }
      }

      const blocks: SuggestBlock[] = [];
      if (directives.length) blocks.push({ kind: "directives", texts: directives });

      for (const [label, kl] of keywordListMap) {
        blocks.push({
          kind: "keywords",
          title: label,
          chips: kl.keywords.map((text) => ({ text })),
          more: kl.more
        });
      }

      const freqByScope = new Map<string, SuggestChip[]>();
      for (const f of freqMap.values()) {
        const arr = freqByScope.get(f.scope) ?? [];
        arr.push({ text: f.text, level: f.level, freqLabel: f.freqLabel });
        freqByScope.set(f.scope, arr);
      }
      for (const [scope, chips] of freqByScope) {
        chips.sort((a, b) => (b.level ?? 0) - (a.level ?? 0));
        blocks.push({ kind: "freq", title: `${scope}使用频次`, chips });
      }

      if (quotes.length) {
        blocks.push({ kind: "quotes", title: `相关示例句（${quotes.length}）`, texts: quotes });
      }

      const count =
        directives.length + keywordListMap.size + freqMap.size + quotes.length;
      return { key: section.key, label: section.label, count, blocks };
    })
    .filter((g) => g.blocks.length > 0)
);

function mergeOptimizeHistory(
  fromSeo: ArticleJobOptimizeRound[] | null | undefined,
  fromDraft: ArticleJobOptimizeRound[] | null | undefined,
): ArticleJobOptimizeRound[] {
  const seo = fromSeo ?? [];
  const draft = fromDraft ?? [];
  if (seo.length === 0) return draft;
  if (draft.length === 0) return seo;

  const keyOf = (item: ArticleJobOptimizeRound) =>
    `${item.phase}|${item.round}|${item.kind ?? "optimize"}|${item.optimizedAt ?? ""}`;
  const merged = new Map<string, ArticleJobOptimizeRound>();
  for (const item of seo) merged.set(keyOf(item), item);
  for (const item of draft) merged.set(keyOf(item), item);
  return [...merged.values()].sort((a, b) =>
    (a.optimizedAt ?? "").localeCompare(b.optimizedAt ?? ""),
  );
}

const optimizeHistory = computed(() =>
  mergeOptimizeHistory(props.seoCheckData?.optimizeHistory, props.optimizeHistory),
);

interface OptimizeScoreRow extends ArticleJobOptimizeRound {
  roundLabel: string;
  delta: number | null;
  predictedDelta: number | null;
  semrushRouteChanged?: boolean;
}

const showPredictedOptimizeScores = computed(
  () =>
    localGateCalibrated.value ||
    optimizeHistory.value.some(
      (item) =>
        item.phase === "local" &&
        (item.predictedSemrushBefore != null ||
          item.predictedSemrushAfter != null ||
          item.candidatePredictedSemrush != null)
    )
);

const optimizeScoreRows = computed((): OptimizeScoreRow[] =>
  optimizeHistory.value.map((item, index, all) => {
    const baselineRoute =
      all.find((r) => r.phase === "semrush" && (r.kind === "baseline" || r.round === 0))
        ?.semrushEvaluationRoute ?? null;
    const isBaseline = item.kind === "baseline" || item.round === 0;
    let roundLabel = "";
    if (isBaseline) {
      roundLabel = item.phase === "local" ? "初稿" : "Semrush 初检";
    } else {
      roundLabel = `第 ${item.round} 轮${item.rolledBack ? "（已回滚）" : ""}`;
    }
    const delta =
      item.scoreBefore != null && item.scoreAfter != null
        ? Math.round((item.scoreAfter - item.scoreBefore) * 10) / 10
        : null;
    const predictedDelta =
      item.predictedSemrushBefore != null && item.predictedSemrushAfter != null
        ? Math.round((item.predictedSemrushAfter - item.predictedSemrushBefore) * 100) / 100
        : null;
    const semrushRouteChanged =
      item.phase === "semrush" &&
      baselineRoute != null &&
      item.semrushEvaluationRoute != null &&
      item.semrushEvaluationRoute !== baselineRoute;
    return { ...item, roundLabel, delta, predictedDelta, semrushRouteChanged };
  })
);

const activeOptimizePanels = ref<string[]>([]);

watch(
  optimizeHistory,
  (items) => {
    if (items.length > 0) {
      const latest = items[items.length - 1];
      activeOptimizePanels.value = [`${latest.phase}-${latest.round}-${latest.optimizedAt}`];
    }
  },
  { immediate: true }
);

const hasData = computed(
  () =>
    localScore.value != null ||
    props.seoCheckData != null ||
    optimizeHistory.value.length > 0
);
const canCheck = computed(() => props.canCheck ?? false);
const canRunSemrushCheck = computed(
  () => canCheck.value && localPassedForSemrush.value === true
);
const semrushGateReason = computed(() => {
  if (!canCheck.value) return "";
  if (localGateCalibrated.value) {
    if (predictedLocalSemrush.value == null) {
      return "预测 Semrush 分尚未就绪，请刷新页面或先保存稿件后再终检";
    }
    if (localPassedForSemrush.value === false) {
      return `预测 Semrush ${predictedLocalSemrush.value}/10，未达 ${semrushPassThreshold.value} 分，请优化后再终检（规则分 ${localScore.value ?? "—"}/100 仅参考）`;
    }
    if (localPassed.value === false && localPassedForSemrush.value === true) {
      return `预测 Semrush ${predictedLocalSemrush.value}/10 接近 ${semrushPassThreshold.value} 分，可进行终检（终检真分仍以 RPA 为准）`;
    }
    return "";
  }
  if (localScore.value == null) {
    return `须先完成本地预检（≥${localPassThreshold.value} 分）后方可 Semrush 终检`;
  }
  if (localPassed.value === false) {
    return `本地预检 ${localScore.value} 分，未达 ${localPassThreshold.value} 分，请按下方建议优化后再终检`;
  }
  return "";
});
const checking = computed(() => props.checking ?? false);
const checkStale = computed(() => props.checkStale ?? false);
const optimizingMessage = computed(() => props.optimizingMessage ?? "");
const canRewrite = computed(() => props.canRewrite ?? false);
const rewriting = computed(() => props.rewriting ?? false);
const rewriteBlockedReason = computed(() => props.rewriteBlockedReason ?? "");

const detailTab = ref("issues");
const footerPanels = ref<string[]>([]);

interface CompactNotice {
  type: "warning" | "error" | "info" | "success";
  title: string;
  description?: string;
}

const compactNotices = computed((): CompactNotice[] => {
  const notices: CompactNotice[] = [];
  if (manualCheckWarning.value) {
    notices.push({
      type: "warning",
      title: "Semrush 终检未完成",
      description: manualCheckWarning.value
    });
  }
  if (failedStepLabel.value) {
    notices.push({
      type: "warning",
      title: `任务失败于「${failedStepLabel.value}」`,
      description: "点「重新生成」将从该步骤继续。"
    });
  }
  if (calibratedScoreGapHint.value) {
    notices.push({
      type: "info",
      title: "规则分 ≠ 预测 Semrush",
      description: calibratedScoreGapHint.value
    });
  }
  if (props.localScoreStale || props.semrushScoreStale) {
    notices.push({
      type: "warning",
      title: "评分已过期",
      description: "稿件已编辑，请到「稿件正文」重算本地 SEO 或重跑 Semrush。"
    });
  }
  if (localBreakdownStale.value) {
    notices.push({
      type: "success",
      title: `本地预检已通过（${localScore.value} 分）`,
      description: "分项为优化快照；终检完成后将同步最新明细。"
    });
  }
  if (localNearMiss.value) {
    notices.push({
      type: "warning",
      title: localNearMissTitle.value,
      description: localNearMissHint.value
    });
  }
  if (semrushNearMiss.value) {
    notices.push({
      type: "warning",
      title: `Semrush ${semrushScore.value}/10，差 ${semrushPointsToGo.value} 分`,
      description: "重新优化将从上次 Semrush 分数继续，不会重跑本地预检。"
    });
  }
  return notices;
});

const statusHint = computed(() => {
  if (!canCheck.value) return "需先有初稿内容";
  if (semrushGateReason.value) return semrushGateReason.value;
  if (checking.value && checkStale.value) {
    return "优化可能已中断，请点「取消检测」后重试";
  }
  if (checking.value && optimizingMessage.value) return optimizingMessage.value;
  if (checking.value) return "优化进行中（约 5–20 分钟）…";
  if (rewriting.value) return "AI 重写中，约 30–90 秒…";
  if (rewriteBlockedReason.value) return rewriteBlockedReason.value;
  return "";
});

const statusHintWarn = computed(
  () =>
    Boolean(semrushGateReason.value) ||
    Boolean(rewriteBlockedReason.value) ||
    (checking.value && checkStale.value)
);

function suggestionIcon(key: string) {
  const icons: Record<string, string> = {
    readability: "ri:book-open-line",
    seo: "ri:search-eye-line",
    tone: "ri:chat-voice-line",
    originality: "ri:fingerprint-line"
  };
  return icons[key] ?? "ri:lightbulb-flash-line";
}

type MetricStatus = "pass" | "warn" | "fail" | "info";

interface MetricGridItem {
  key: string;
  label: string;
  value: string;
  target?: string;
  status: MetricStatus;
}

interface MetricGroup {
  key: string;
  title: string;
  items: MetricGridItem[];
}

// 计数型指标（越小越好）：超出目标即预警，超出较多判失败
function countStatus(value: number, target: number): MetricStatus {
  if (value <= target) return "pass";
  const margin = Math.max(1, Math.round(target * 0.5));
  return value <= target + margin ? "warn" : "fail";
}

// 分值型指标（越大越好）
function scoreStatus(value: number, good: number, ok: number): MetricStatus {
  if (value >= good) return "pass";
  if (value >= ok) return "warn";
  return "fail";
}

// 可读性指数（Flesch / Semrush SWA 同量纲）：对齐目标区间，过高过低都不好
// 默认目标 50、容差 ±8（B2B 常见 48–52；禁止硬编码 ≥70）
const READABILITY_TARGET = 50;
const READABILITY_TOLERANCE = 8;
function rangeStatus(
  value: number,
  target = READABILITY_TARGET,
  tolerance = READABILITY_TOLERANCE
): MetricStatus {
  const delta = Math.abs(value - target);
  if (delta <= tolerance) return "pass";
  if (delta <= tolerance * 2) return "warn";
  return "fail";
}

const readabilityMetricItems = computed((): MetricGridItem[] => {
  const items: MetricGridItem[] = [];
  const m = metrics.value;
  if (!m) return items;
  if (m.fleschReadingEase != null) {
    items.push({
      key: "flesch",
      label: "Flesch 易读度",
      value: String(m.fleschReadingEase),
      target: "≈ 50 (±8)",
      status: rangeStatus(m.fleschReadingEase)
    });
  }
  if (semrushReadabilityScore.value != null) {
    items.push({
      key: "semrush-read",
      label: "Semrush 可读性",
      value: `${semrushReadabilityScore.value}/100`,
      target: "≈ 50 (±8)",
      status: rangeStatus(semrushReadabilityScore.value)
    });
  }
  if (m.hardToReadSentenceHits != null) {
    items.push({
      key: "hard-read",
      label: "难读句",
      value: String(m.hardToReadSentenceHits),
      target: "≤ 2",
      status: countStatus(m.hardToReadSentenceHits, 2)
    });
  }
  if (m.longSentencesOver22 != null) {
    items.push({
      key: "long-sent",
      label: "超长句",
      value: String(m.longSentencesOver22),
      target: "≤ 2",
      status: countStatus(m.longSentencesOver22, 2)
    });
  }
  if (m.passiveVoiceHits != null) {
    items.push({
      key: "passive",
      label: "被动语态",
      value: String(m.passiveVoiceHits),
      target: "≤ 6",
      status: countStatus(m.passiveVoiceHits, 6)
    });
  }
  if (m.casualSentenceHits != null) {
    items.push({
      key: "casual",
      label: "随意句",
      value: String(m.casualSentenceHits),
      target: "≤ 3",
      status: countStatus(m.casualSentenceHits, 3)
    });
  }
  if (m.semrushComplexWordHits != null) {
    items.push({
      key: "complex",
      label: "复杂词",
      value: `${m.semrushComplexWordHits} 处`,
      target: "越少越好",
      status: countStatus(m.semrushComplexWordHits, 5)
    });
  }
  return items;
});

const structureMetricItems = computed((): MetricGridItem[] => {
  const items: MetricGridItem[] = [];
  const m = metrics.value;
  if (!m) return items;
  if (m.longParagraphsOver65 != null) {
    items.push({
      key: "long-para",
      label: "超长段",
      value: String(m.longParagraphsOver65),
      target: "≤ 1",
      status: countStatus(m.longParagraphsOver65, 1)
    });
  }
  if (m.wordCount) {
    items.push({
      key: "wc",
      label: "词数",
      value: String(m.wordCount),
      status: "info"
    });
  }
  if (semrushWordGap.value != null) {
    const gap = semrushWordGap.value;
    items.push({
      key: "word-gap",
      label: "词数差",
      value: gap > 0 ? `缺 ${gap}` : gap < 0 ? `超 ${Math.abs(gap)}` : "持平",
      target: "≥ 竞品",
      status: gap <= 0 ? "pass" : gap <= 150 ? "warn" : "fail"
    });
  }
  if (m.matchedSerpTerms != null && m.totalSerpTerms) {
    const ratio = m.matchedSerpTerms / m.totalSerpTerms;
    items.push({
      key: "serp",
      label: "搜索词对齐",
      value: `${m.matchedSerpTerms}/${m.totalSerpTerms}`,
      target: "尽量全覆盖",
      status: ratio >= 0.8 ? "pass" : ratio >= 0.5 ? "warn" : "fail"
    });
  }
  if (m.keywordDensity != null) {
    items.push({
      key: "kd",
      label: "关键词密度",
      value: `${m.keywordDensity}%`,
      status: "info"
    });
  }
  return items;
});

const metricGroups = computed((): MetricGroup[] =>
  [
    { key: "readability", title: "可读性", items: readabilityMetricItems.value },
    { key: "structure", title: "结构", items: structureMetricItems.value }
  ].filter((group) => group.items.length > 0)
);

const hasMetricGroups = computed(() =>
  metricGroups.value.some((group) => group.items.length > 0)
);

const allSuggestions = computed(() =>
  [...new Set([...localSuggestions.value, ...semrushSuggestions.value].filter(Boolean))]
);

const suggestionCount = computed(() => {
  if (suggestionGroups.value.length) {
    return suggestionGroups.value.reduce((sum, g) => sum + g.count, 0);
  }
  return allSuggestions.value.length;
});

const localScoreClass = computed(() => {
  if (localGateCalibrated.value && predictedLocalSemrush.value != null) {
    if (localGateDisplayPassed.value === true) return "seo-score-card__value--pass";
    if (localGateDisplayPassed.value === false) return "seo-score-card__value--warn";
    return "";
  }
  if (localScore.value == null) return "";
  if (localScore.value >= localPassThreshold.value) return "seo-score-card__value--pass";
  if (localScore.value >= 60) return "seo-score-card__value--warn";
  return "seo-score-card__value--fail";
});

const semrushScoreClass = computed(() => {
  if (semrushSkipped.value || semrushScore.value == null) return "";
  if (semrushScore.value >= semrushPassThreshold.value) return "seo-score-card__value--pass";
  if (semrushScore.value >= 8) return "seo-score-card__value--warn";
  return "seo-score-card__value--fail";
});

function noticeIcon(type: CompactNotice["type"]) {
  const icons = {
    success: "ri:checkbox-circle-line",
    warning: "ri:alert-line",
    info: "ri:information-line",
    error: "ri:error-warning-line"
  };
  return icons[type];
}

function breakdownBarClass(item: { value: number; max: number }) {
  if (item.value >= item.max) return "";
  if (item.max - item.value <= 6) return "is-warn";
  return "is-fail";
}

watch(issueItems, (items) => {
  if (items.length > 0) detailTab.value = "issues";
});

watch(releaseReady, (ready) => {
  if (ready && (detailTab.value === "suggestions" || detailTab.value === "issues")) {
    detailTab.value = "issues";
  }
});

function phaseLabel(phase: ArticleJobOptimizeRound["phase"]) {
  return phase === "local" ? "本地 SEO" : "Semrush";
}

function phaseTagType(phase: ArticleJobOptimizeRound["phase"]) {
  return phase === "local" ? "primary" : "success";
}

function formatRoundScore(
  score: number | null | undefined,
  phase: ArticleJobOptimizeRound["phase"]
) {
  if (score == null) return "-";
  return phase === "local" ? `${score} / 100` : `${score} / 10`;
}

function formatPredictedSemrush(score: number | null | undefined): string {
  if (score == null) return "-";
  return `${Math.round(score * 100) / 100} / 10`;
}

function formatRowPredictedScore(row: unknown, which: "before" | "after"): string {
  const item = asOptimizeRow(row);
  if (item.phase !== "local") return "-";
  const score =
    which === "before" ? item.predictedSemrushBefore : item.predictedSemrushAfter;
  return formatPredictedSemrush(score);
}

function getRowPredictedDelta(row: unknown): number | null {
  const item = asOptimizeRow(row);
  if (item.phase !== "local") return null;
  if (item.predictedSemrushBefore == null || item.predictedSemrushAfter == null) {
    return null;
  }
  return Math.round((item.predictedSemrushAfter - item.predictedSemrushBefore) * 100) / 100;
}

function formatOptimizePredictedSummary(item: ArticleJobOptimizeRound): string {
  if (item.phase !== "local") return "";
  const before = item.predictedSemrushBefore;
  const after = item.predictedSemrushAfter;
  if (before != null && after != null) {
    return `${Math.round(before * 100) / 100} → ${Math.round(after * 100) / 100}`;
  }
  if (after != null) return `${Math.round(after * 100) / 100} / 10`;
  return "";
}

function formatRollbackReason(row: ArticleJobOptimizeRound): string {
  if (row.phase === "local" && localGateCalibrated.value) {
    if (row.rollbackReason === "keyword_coverage_regressed") {
      return "关键词覆盖下降";
    }
    return "预测 Semrush 未提升";
  }
  if (row.phase === "local") {
    return "本地分未提升";
  }
  if (row.rollbackReason === "local_below_threshold") {
    return `本地分 ${row.candidateLocalScoreAfter ?? "?"} 低于保留门槛（历史策略，已改为 Semrush 优先）`;
  }
  if (row.rollbackReason === "both") {
    return `Semrush 未提升且本地分 ${row.candidateLocalScoreAfter ?? "?"} 未达 ${localPassThreshold.value}（历史策略）`;
  }
  if (row.rollbackReason === "target_keyword_regressed") {
    return "目标词覆盖下降";
  }
  return "Semrush 分未提升";
}

function formatRollbackDetail(item: ArticleJobOptimizeRound): string {
  if (!item.rolledBack || item.candidateScoreAfter == null) {
    return "本轮改稿未通过验收，已恢复历史最优稿。";
  }
  const kept = formatRoundScore(item.scoreAfter, item.phase);
  const candidate = formatRoundScore(item.candidateScoreAfter, item.phase);
  if (item.phase === "local") {
    if (localGateCalibrated.value) {
      const keptPredicted = formatPredictedSemrush(item.predictedSemrushAfter);
      const candidatePredicted =
        item.candidatePredictedSemrush != null
          ? formatPredictedSemrush(item.candidatePredictedSemrush)
          : null;
      if (candidatePredicted) {
        return `AI 改稿后规则分 ${candidate}，预测 ${candidatePredicted} 未超过保留稿（规则分 ${kept}，预测 ${keptPredicted}），已回滚。`;
      }
      return `AI 改稿后规则分 ${candidate}，预测 Semrush 未超过保留稿（规则分 ${kept}），已回滚。`;
    }
    return `AI 改稿后本地预检为 ${candidate}，未超过保留稿 ${kept}，已回滚。`;
  }
  const keptLocal =
    item.localScoreAfter != null ? `${item.localScoreAfter} / 100` : "—";
  const candidateLocal =
    item.candidateLocalScoreAfter != null
      ? `${item.candidateLocalScoreAfter} / 100`
      : "—";
  if (item.rollbackReason === "local_below_threshold") {
    return `Semrush 候选 ${candidate}，但本地分 ${candidateLocal} 低于历史保留门槛，已保留 Semrush ${kept}、本地 ${keptLocal} 的最优稿（当前策略：Semrush 优先）。`;
  }
  if (item.rollbackReason === "both") {
    return `Semrush 候选 ${candidate} 未提升，且本地分 ${candidateLocal} 低于门槛 ${localPassThreshold.value}，已保留 Semrush ${kept}、本地 ${keptLocal} 的最优稿。`;
  }
  if (item.rollbackReason === "target_keyword_regressed") {
    return `Semrush 候选 ${candidate} 已达标，但提交目标词覆盖比保留稿下降（本地 ${candidateLocal}），已保留 Semrush ${kept}、本地 ${keptLocal} 的最优稿。`;
  }
  return `Semrush 候选 ${candidate} 未超过保留稿 ${kept}（本地 ${candidateLocal}），已回滚。`;
}

function formatDelta(delta: number) {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `${delta}`;
  return "0";
}

function asOptimizeRow(row: unknown): ArticleJobOptimizeRound {
  return row as ArticleJobOptimizeRound;
}

function formatRowScore(row: unknown, which: "before" | "after") {
  const item = asOptimizeRow(row);
  return formatRoundScore(
    which === "before" ? item.scoreBefore : item.scoreAfter,
    item.phase,
  );
}

function formatRowLocalScoreDetail(row: unknown): string {
  const item = asOptimizeRow(row);
  if (item.phase === "semrush" && item.rolledBack && item.candidateLocalScoreAfter != null) {
    const kept = item.localScoreAfter != null ? `${item.localScoreAfter}` : "?";
    return `${item.candidateLocalScoreAfter}→${kept}`;
  }
  return item.localScoreAfter != null ? `${item.localScoreAfter}` : "";
}

function formatRowLocalScore(row: unknown) {
  const detail = formatRowLocalScoreDetail(row);
  return detail || "-";
}

function formatRowTime(row: unknown) {
  return formatTime(asOptimizeRow(row).optimizedAt);
}

function getRowDelta(row: unknown): number | null {
  const item = asOptimizeRow(row);
  if (item.scoreBefore == null || item.scoreAfter == null) return null;
  return Math.round((item.scoreAfter - item.scoreBefore) * 10) / 10;
}

function scoreDeltaClass(delta: number | null) {
  if (delta == null) return "";
  if (delta > 0) return "text-green-600 font-medium";
  if (delta < 0) return "text-red-600 font-medium";
  return "text-gray-500";
}

function formatTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("zh-CN");
}

function readabilityMetricClass(value: number, maxAllowed: number) {
  if (value <= maxAllowed) return "text-green-600";
  return "text-red-600 font-medium";
}

const localTagType = computed(() => {
  if (localScore.value == null) return "info";
  if (localScore.value >= localPassThreshold.value) return "success";
  if (localScore.value >= 60) return "warning";
  return "danger";
});

const semrushTagType = computed(() => {
  if (semrushScore.value == null) return "info";
  if (semrush.value?.passed === true || semrushScore.value >= semrushPassThreshold.value) {
    return "success";
  }
  if (semrushScore.value >= 8) return "warning";
  return "danger";
});

const BREAKDOWN_MAX: Record<string, number> = {
  keyword: 25,
  serp: 25,
  structure: 20,
  readability: 20,
  depth: 10,
};

function breakdownValueClass(item: { value: number; max: number }) {
  if (item.value >= item.max) return "text-green-600";
  if (item.max - item.value <= 6) return "text-amber-600";
  return "text-red-600";
}

const breakdownItems = computed(() => {
  const b = breakdown.value;
  if (!b) return [];
  const items = [
    { key: "keyword", label: "关键词", value: b.keywordCoverage, max: BREAKDOWN_MAX.keyword },
    { key: "serp", label: "搜索词", value: b.serpTermAlignment, max: BREAKDOWN_MAX.serp },
    { key: "structure", label: "结构", value: b.structure, max: BREAKDOWN_MAX.structure },
    { key: "readability", label: "可读性", value: b.readability ?? 0, max: BREAKDOWN_MAX.readability },
    { key: "depth", label: "深度", value: b.contentDepth, max: BREAKDOWN_MAX.depth },
  ];
  return items
    .filter((item) => item.value != null)
    .map((item) => ({ ...item, gap: item.max - item.value }));
});
</script>
