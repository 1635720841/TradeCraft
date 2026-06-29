<!--
  创作报告：可打印的任务成果摘要。

  边界：
  - 不负责：PDF 生成（浏览器打印另存）
-->
<template>
  <el-dialog
    v-model="visible"
    title="创作报告"
    width="720px"
    class="job-creation-report-dialog"
    destroy-on-close
    @closed="emit('closed')"
  >
    <div ref="reportRef" class="job-creation-report">
      <header class="job-creation-report__header">
        <h1>{{ job.targetKeyword }}</h1>
        <p class="job-creation-report__meta">
          生成时间 {{ formatTime(job.updatedAt || job.createdAt) }}
          <span v-if="job.siteDomain"> · {{ job.siteDomain }}</span>
        </p>
      </header>

      <section class="job-creation-report__scores">
        <div class="job-creation-report__score-block">
          <span class="job-creation-report__score-label">本地 SEO</span>
          <strong :class="summary.localPassed ? 'is-pass' : 'is-warn'">
            {{ summary.localScore ?? "—" }} / 100
          </strong>
        </div>
        <div class="job-creation-report__score-block">
          <span class="job-creation-report__score-label">Semrush 终检</span>
          <strong :class="summary.semrushPassed ? 'is-pass' : 'is-warn'">
            {{ summary.semrushScore ?? "—" }} / 10
          </strong>
        </div>
        <div v-if="summary.wordCount != null" class="job-creation-report__score-block">
          <span class="job-creation-report__score-label">字数</span>
          <strong>{{ summary.wordCount }}</strong>
        </div>
        <div v-if="summary.readMinutes != null" class="job-creation-report__score-block">
          <span class="job-creation-report__score-label">阅读时长</span>
          <strong>{{ summary.readMinutes }} 分钟</strong>
        </div>
      </section>

      <p v-if="summary.benchmarkLine" class="job-creation-report__benchmark">
        {{ summary.benchmarkLine }}
      </p>

      <ArticleJobSeoBreakdownRadar :seo-check-data="job.seoCheckData" />

      <section v-if="checklistLines.length" class="job-creation-report__checklist">
        <h2>发布检查</h2>
        <ul>
          <li v-for="(line, i) in checklistLines" :key="i">{{ line }}</li>
        </ul>
      </section>

      <section v-if="resolvedMeta.title" class="job-creation-report__article-meta">
        <h2>文章信息</h2>
        <p><strong>标题</strong> {{ resolvedMeta.title }}</p>
        <p v-if="resolvedMeta.metaDescription">
          <strong>Meta Description</strong> {{ resolvedMeta.metaDescription }}
        </p>
      </section>
    </div>

    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
      <el-button type="primary" @click="handlePrint">打印 / 另存 PDF</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { ArticleJobItem } from "@/api/seo-factory/types";
import Print from "@/utils/print";
import { buildJobDetailSummary } from "@/utils/seo-factory/job-detail-summary";
import { buildPublishChecklist, resolveDraftTitleAndMeta } from "@/utils/seo-factory/draft-edit-preview";
import { resolveEffectiveLocalSeoScore } from "@/utils/seo-factory/local-seo-display";
import ArticleJobSeoBreakdownRadar from "./ArticleJobSeoBreakdownRadar.vue";

defineOptions({ name: "ArticleJobCreationReport" });

const props = defineProps<{
  job: ArticleJobItem;
  checklistLines?: string[];
}>();

const emit = defineEmits<{
  closed: [];
}>();

const visible = defineModel<boolean>({ required: true });

const reportRef = ref<HTMLElement | null>(null);

const summary = computed(() => buildJobDetailSummary(props.job));
const resolvedMeta = computed(() =>
  resolveDraftTitleAndMeta(props.job.draftData, props.job.briefData)
);

const defaultChecklistLines = computed(() => {
  const items = buildPublishChecklist({
    staleness: props.job.draftData?.staleness,
    localSeoScore: resolveEffectiveLocalSeoScore(props.job),
    outputUrl: props.job.outputUrl,
    ymylReview: props.job.seoCheckData?.ymylReview,
    draftContent: props.job.draftData?.content ?? ""
  });
  if (!items.length && props.job.outputUrl) {
    return ["导出物已就绪"];
  }
  return items.map((item) => `${item.done ? "✓" : "○"} ${item.label}`);
});

const checklistLines = computed(
  () => (props.checklistLines?.length ? props.checklistLines : defaultChecklistLines.value)
);

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("zh-CN");
}

function handlePrint() {
  if (!reportRef.value) return;
  Print(reportRef.value, {
    printDoneCallBack: () => {}
  });
}
</script>
