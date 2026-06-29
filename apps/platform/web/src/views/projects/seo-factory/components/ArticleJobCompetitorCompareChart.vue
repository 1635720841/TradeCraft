<!--
  竞品对比条形图：我方 vs 竞品中位（词数、H2）。

  边界：
  - 不负责：SERP 抓取
-->
<template>
  <div v-if="hasData" class="job-competitor-chart">
    <div class="job-competitor-chart__head">对标竞品</div>
    <div ref="chartRef" class="job-competitor-chart__canvas" />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { summarizeCompetitorSerp } from "@wm/shared-core";
import type { ArticleJobBriefData, ArticleJobDraftData, ArticleJobSeoCheckData, ArticleJobSerpData } from "@/api/seo-factory/types";
import { countDraftWords } from "@/utils/seo-factory/draft-edit-preview";

echarts.use([BarChart, GridComponent, TooltipComponent, CanvasRenderer]);

defineOptions({ name: "ArticleJobCompetitorCompareChart" });

const props = defineProps<{
  serpData?: ArticleJobSerpData | null;
  briefData?: ArticleJobBriefData | null;
  draftData?: ArticleJobDraftData | null;
  seoCheckData?: ArticleJobSeoCheckData | null;
}>();

const chartRef = ref<HTMLElement | null>(null);
let chart: echarts.ECharts | null = null;
let resizeObserver: ResizeObserver | null = null;

const summary = computed(() =>
  summarizeCompetitorSerp(props.serpData?.organic ?? [], {
    targetWordCount: props.briefData?.outline?.targetWordCount,
    scrapeMeta: props.serpData?.competitorScrapeMeta
  })
);

const ourWordCount = computed(() => {
  const content = props.draftData?.content ?? "";
  return content.trim() ? countDraftWords(content) : null;
});

const ourH2Count = computed(() => props.seoCheckData?.local?.metrics?.h2Count ?? null);

const competitorAvgH2 = computed(() => {
  const counts = summary.value.rows
    .filter((r) => r.scraped && r.headingCount > 0)
    .map((r) => r.headingCount);
  if (counts.length === 0) return null;
  return Math.round(counts.reduce((a, b) => a + b, 0) / counts.length);
});

const hasData = computed(() => {
  const median = summary.value.medianWordCount;
  return (
    (ourWordCount.value != null && median != null) ||
    (ourH2Count.value != null && competitorAvgH2.value != null)
  );
});

const chartCategories = computed(() => {
  const cats: string[] = [];
  if (ourWordCount.value != null && summary.value.medianWordCount != null) {
    cats.push("词数");
  }
  if (ourH2Count.value != null && competitorAvgH2.value != null) {
    cats.push("H2 数量");
  }
  return cats;
});

const ourValues = computed(() => {
  const vals: number[] = [];
  if (ourWordCount.value != null && summary.value.medianWordCount != null) {
    vals.push(ourWordCount.value);
  }
  if (ourH2Count.value != null && competitorAvgH2.value != null) {
    vals.push(ourH2Count.value);
  }
  return vals;
});

const competitorValues = computed(() => {
  const vals: number[] = [];
  if (ourWordCount.value != null && summary.value.medianWordCount != null) {
    vals.push(summary.value.medianWordCount!);
  }
  if (ourH2Count.value != null && competitorAvgH2.value != null) {
    vals.push(competitorAvgH2.value!);
  }
  return vals;
});

async function renderChart() {
  if (!chartRef.value || !hasData.value) return;
  await nextTick();
  if (chartRef.value.clientWidth <= 0) return;

  if (!chart) {
    chart = echarts.init(chartRef.value);
  }
  chart.setOption(
    {
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      legend: { top: 0, data: ["本文", "竞品中位"] },
      grid: { left: 48, right: 16, top: 32, bottom: 28 },
      xAxis: { type: "value" },
      yAxis: {
        type: "category",
        data: chartCategories.value
      },
      series: [
        {
          name: "本文",
          type: "bar",
          data: ourValues.value,
          label: { show: true, position: "right" }
        },
        {
          name: "竞品中位",
          type: "bar",
          data: competitorValues.value,
          label: { show: true, position: "right" }
        }
      ]
    },
    true
  );
  chart.resize();
}

function bindResizeObserver() {
  if (!chartRef.value || resizeObserver) return;
  resizeObserver = new ResizeObserver((entries) => {
    const width = entries[0]?.contentRect.width ?? 0;
    if (width > 0) {
      void renderChart();
    } else {
      chart?.resize();
    }
  });
  resizeObserver.observe(chartRef.value);
}

function handleWindowResize() {
  chart?.resize();
}

onMounted(() => {
  bindResizeObserver();
  void renderChart();
  window.addEventListener("resize", handleWindowResize);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  window.removeEventListener("resize", handleWindowResize);
  chart?.dispose();
  chart = null;
});

watch(hasData, async (visible) => {
  if (!visible) return;
  await nextTick();
  bindResizeObserver();
  void renderChart();
});

watch([chartCategories, ourValues, competitorValues], () => void renderChart(), { deep: true });
</script>
