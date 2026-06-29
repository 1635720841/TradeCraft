<!--
  本地 SEO 分项雷达图（5 维归一化）。

  边界：
  - 不负责：评分计算
-->
<template>
  <div v-if="hasData" class="job-seo-radar">
    <div ref="chartRef" class="job-seo-radar__chart" />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import * as echarts from "echarts/core";
import { RadarChart } from "echarts/charts";
import { RadarComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { ArticleJobSeoCheckData } from "@/api/seo-factory/types";

echarts.use([RadarChart, RadarComponent, TooltipComponent, CanvasRenderer]);

defineOptions({ name: "ArticleJobSeoBreakdownRadar" });

const props = defineProps<{
  seoCheckData?: ArticleJobSeoCheckData | null;
}>();

const chartRef = ref<HTMLElement | null>(null);
let chart: echarts.ECharts | null = null;
let resizeObserver: ResizeObserver | null = null;

const breakdown = computed(() => props.seoCheckData?.local?.breakdown);

const axes = [
  { key: "keywordCoverage", label: "关键词", max: 25 },
  { key: "serpTermAlignment", label: "搜索词", max: 25 },
  { key: "structure", label: "结构", max: 20 },
  { key: "readability", label: "可读性", max: 20 },
  { key: "contentDepth", label: "深度", max: 10 }
] as const;

const hasData = computed(() => {
  const b = breakdown.value;
  if (!b) return false;
  return axes.some((axis) => {
    const val = b[axis.key as keyof typeof b];
    return typeof val === "number";
  });
});

const chartValues = computed(() => {
  const b = breakdown.value;
  if (!b) return [];
  return axes.map((axis) => {
    const raw = b[axis.key as keyof typeof b];
    if (typeof raw !== "number") return 0;
    return Math.round((raw / axis.max) * 100);
  });
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
      tooltip: { trigger: "item" },
      radar: {
        indicator: axes.map((a) => ({ name: a.label, max: 100 })),
        radius: "62%"
      },
      series: [
        {
          type: "radar",
          data: [
            {
              value: chartValues.value,
              name: "本地预检",
              areaStyle: { opacity: 0.2 }
            }
          ]
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

watch(chartValues, () => void renderChart(), { deep: true });
</script>
