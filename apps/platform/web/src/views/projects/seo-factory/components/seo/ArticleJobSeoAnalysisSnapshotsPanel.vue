<!--
  SEO 检测快照时间线：正文、关键词、Semrush 建议等，供后期分析。

  边界：
  - 不负责：快照写入（后端 seo-checker）
-->
<template>
  <div class="mt-4 rounded border border-gray-200 bg-gray-50/50 p-3">
    <el-collapse v-model="panelOpen">
      <el-collapse-item name="snapshots">
        <template #title>
          <div class="flex flex-wrap items-center gap-2 pr-2">
            <span class="font-medium text-gray-800">检测快照（分析用）</span>
            <el-tag size="small" type="info" effect="plain">{{ snapshots.length }} 条</el-tag>
            <span class="text-xs text-gray-500">真实 RPA / 本地检测完成后记录，只增不改</span>
          </div>
        </template>

        <el-empty v-if="snapshots.length === 0" description="暂无检测快照，重新优化或 Semrush 终检后将自动记录" :image-size="64" />

        <div v-else class="snapshots-scroll">
          <el-collapse v-model="activeIds" class="snapshots-list">
            <el-collapse-item v-for="item in sortedSnapshots" :key="item.id" :name="item.id">
              <template #title>
                <div class="flex flex-wrap items-center gap-2 pr-2 text-sm">
                  <el-tag :type="kindTagType(item.kind)" size="small">{{ kindLabel(item.kind) }}</el-tag>
                  <span class="text-gray-600">{{ formatTime(item.checkedAt) }}</span>
                  <span v-if="item.rpaCheckedAt" class="text-xs text-gray-400">RPA {{ formatTime(item.rpaCheckedAt) }}</span>
                  <span v-if="item.round != null" class="text-gray-500">轮次 {{ item.round }}</span>
                  <el-tag v-if="item.rolledBack" size="small" type="warning">已回滚</el-tag>
                  <el-tag v-if="item.localScore != null" size="small" effect="plain">本地 {{ item.localScore }}</el-tag>
                  <el-tag v-if="item.semrushOverall != null" size="small" effect="plain">Semrush {{ item.semrushOverall }}</el-tag>
                  <span class="text-xs text-gray-400">hash:{{ item.contentHash }}</span>
                </div>
              </template>

              <el-descriptions :column="2" border size="small" class="mb-3">
                <el-descriptions-item label="标题" :span="2">{{ item.title }}</el-descriptions-item>
                <el-descriptions-item label="目标词">{{ item.targetKeyword }}</el-descriptions-item>
                <el-descriptions-item label="词数">{{ item.contentWordCount }}</el-descriptions-item>
                <el-descriptions-item v-if="item.semrushNode" label="3ue 节点">{{ nodeLabel(item) }}</el-descriptions-item>
                <el-descriptions-item v-if="item.domScore != null" label="DOM 分">{{ item.domScore }}</el-descriptions-item>
                <el-descriptions-item v-if="item.apiScore != null" label="API 分">{{ item.apiScore }}</el-descriptions-item>
                <el-descriptions-item v-if="item.semrushReadabilityScore != null" label="Semrush 可读性">{{ item.semrushReadabilityScore }}</el-descriptions-item>
                <el-descriptions-item v-if="wordCountGap(item) != null" label="词数差">{{ wordCountGap(item) }}</el-descriptions-item>
                <el-descriptions-item v-if="item.submittedKeywords?.length" label="提交关键词" :span="2">
                  <el-tag v-for="kw in item.submittedKeywords" :key="kw" class="mr-1 mb-1" size="small">{{ kw }}</el-tag>
                </el-descriptions-item>
              </el-descriptions>

              <div v-if="item.localBreakdown" class="mb-3">
                <div class="mb-1 text-sm font-medium text-gray-700">本地分项</div>
                <div class="flex flex-wrap gap-2 text-xs">
                  <el-tag size="small">关键词 {{ item.localBreakdown.keywordCoverage }}/25</el-tag>
                  <el-tag size="small">搜索词 {{ item.localBreakdown.serpTermAlignment }}/25</el-tag>
                  <el-tag size="small">结构 {{ item.localBreakdown.structure }}/20</el-tag>
                  <el-tag size="small">可读 {{ item.localBreakdown.readability ?? "-" }}/20</el-tag>
                  <el-tag size="small">深度 {{ item.localBreakdown.contentDepth }}/10</el-tag>
                </div>
              </div>

              <div v-if="semrushSuggestionSections(item).length" class="mb-3">
                <div class="mb-1 text-sm font-medium text-gray-700">Semrush 建议</div>
                <div v-for="section in semrushSuggestionSections(item)" :key="section.key" class="mb-2">
                  <div class="text-xs font-medium text-gray-600">{{ section.label }}</div>
                  <ul class="list-disc pl-5 text-sm text-gray-700">
                    <li v-for="(line, i) in section.items" :key="i">{{ line }}</li>
                  </ul>
                </div>
              </div>

              <div v-else-if="item.semrushSuggestions?.length" class="mb-3">
                <div class="mb-1 text-sm font-medium text-gray-700">Semrush 建议</div>
                <ul class="list-disc pl-5 text-sm text-gray-700">
                  <li v-for="(line, i) in item.semrushSuggestions" :key="i">{{ line }}</li>
                </ul>
              </div>

              <div v-if="item.localSuggestions?.length" class="mb-3">
                <div class="mb-1 text-sm font-medium text-gray-700">本地建议</div>
                <ul class="list-disc pl-5 text-sm text-gray-700">
                  <li v-for="(line, i) in item.localSuggestions" :key="i">{{ line }}</li>
                </ul>
              </div>

              <div v-if="item.actionableIssues?.length" class="mb-3">
                <div class="mb-1 text-sm font-medium text-gray-700">侧栏结构化问题</div>
                <ul class="space-y-2 text-sm">
                  <li v-for="(issue, i) in item.actionableIssues" :key="i" class="rounded border border-amber-100 bg-amber-50/60 px-2 py-1">
                    <span class="font-medium text-amber-800">{{ issue.label }}</span>
                    <span v-if="issue.quotes?.length" class="block text-gray-700 mt-0.5">{{ issue.quotes.slice(0, 3).join(" · ") }}</span>
                  </li>
                </ul>
              </div>

              <div class="mb-2 text-sm font-medium text-gray-700">正文</div>
              <pre class="snapshot-content">{{ displayContent(item) }}</pre>
            </el-collapse-item>
          </el-collapse>
        </div>
      </el-collapse-item>
    </el-collapse>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { ArticleJobSeoAnalysisSnapshot } from "@/api/seo-factory/types";

defineOptions({ name: "ArticleJobSeoAnalysisSnapshotsPanel" });

const props = defineProps<{
  snapshots?: ArticleJobSeoAnalysisSnapshot[] | null;
}>();

const panelOpen = ref<string[]>([]);
const activeIds = ref<string[]>([]);

const snapshots = computed(() => props.snapshots ?? []);

const sortedSnapshots = computed(() =>
  [...snapshots.value].sort((a, b) => b.checkedAt.localeCompare(a.checkedAt)),
);

function kindLabel(kind: ArticleJobSeoAnalysisSnapshot["kind"]) {
  if (kind === "local_checkpoint") return "本地检测";
  if (kind === "semrush_manual_check") return "手动 Semrush";
  return "Semrush 检测";
}

function kindTagType(kind: ArticleJobSeoAnalysisSnapshot["kind"]) {
  if (kind === "local_checkpoint") return "info";
  if (kind === "semrush_manual_check") return "warning";
  return "success";
}

function formatTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

function nodeLabel(item: ArticleJobSeoAnalysisSnapshot) {
  return item.semrushNodeLabel ?? item.semrushNode ?? item.semrushEvaluationRoute ?? "-";
}

function wordCountGap(item: ArticleJobSeoAnalysisSnapshot) {
  const current = item.semrushCurrentWordCount;
  const competitor = item.semrushCompetitorWordCount;
  if (typeof current !== "number" || typeof competitor !== "number") return null;
  const gap = competitor - current;
  return gap >= 0 ? `缺 ${gap} 词` : `超 ${Math.abs(gap)} 词`;
}

function semrushSuggestionSections(item: ArticleJobSeoAnalysisSnapshot) {
  const details = item.suggestionDetails;
  if (!details) return [];
  const sections = [
    { key: "readability", label: "可读性", items: details.readability ?? [] },
    { key: "seo", label: "SEO", items: details.seo ?? [] },
    { key: "tone", label: "语气", items: details.tone ?? [] },
    { key: "originality", label: "原创性", items: details.originality ?? [] },
  ];
  return sections.filter((s) => s.items.length > 0);
}

function displayContent(item: ArticleJobSeoAnalysisSnapshot) {
  const full = item.content?.trim();
  if (full) return full.length > 12000 ? `${full.slice(0, 12000)}\n\n…（已截断）` : full;
  return item.contentPreview;
}
</script>

<style scoped>
.snapshots-scroll {
  max-height: min(70vh, 720px);
  overflow-y: auto;
  overscroll-behavior: contain;
}

.snapshots-list :deep(.el-collapse-item__header) {
  height: auto;
  min-height: 40px;
  line-height: 1.4;
  padding-top: 6px;
  padding-bottom: 6px;
}

.snapshot-content {
  max-height: 280px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  padding: 0.75rem;
  border-radius: 0.375rem;
  border: 1px solid var(--el-border-color-lighter);
  background: #fff;
  font-size: 12px;
  line-height: 1.6;
  color: #374151;
}
</style>
