<!--
  分析搜索结果：竞品字数、H 结构、正文摘录，对照大纲目标字数与差异化。

  边界：
  - 不负责：SERP 抓取（后端 ScraperService）
-->
<template>
  <div>
    <div v-if="showRefreshAction" class="mb-4 flex flex-wrap items-center gap-2">
      <el-button type="primary" :loading="refreshing" :disabled="refreshing" @click="emit('refresh')">
        重新分析搜索结果
      </el-button>
      <span class="text-sm text-gray-500">仅更新竞品列表与正文抓取，不会重跑大纲或初稿。</span>
    </div>

    <el-alert
      v-if="lowSampleWarning"
      type="warning"
      :closable="false"
      show-icon
      class="mb-4"
      :title="lowSampleWarning.title"
      :description="lowSampleWarning.description"
    />

    <el-alert
      v-if="summary.scrapeSkipped"
      type="info"
      :closable="false"
      show-icon
      class="mb-4"
      title="竞品正文抓取未启用"
      description="当前环境未抓取竞品正文，仅展示搜索结果摘要。大纲仍基于 Serper 数据生成。"
    />

    <el-alert
      v-else-if="summary.total > 0 && summary.scrapedCount === 0"
      type="warning"
      :closable="false"
      show-icon
      class="mb-4"
      title="竞品正文抓取失败"
      :description="scrapeFailureDescription"
    />

    <el-alert
      v-else-if="summary.scrapedCount > 0 && summary.scrapeFailedCount > 0"
      type="warning"
      :closable="false"
      show-icon
      class="mb-4"
      :title="`已分析 ${summary.scrapedCount} 篇，${summary.scrapeFailedCount} 篇抓取失败`"
      :description="scrapeFailureDescription"
    />

    <el-alert
      v-else-if="summary.scrapedCount > 0"
      type="success"
      :closable="false"
      show-icon
      class="mb-4"
      :title="`已分析 ${summary.scrapedCount} 篇竞品正文`"
      :description="scrapeSuccessDescription"
    />

    <el-descriptions v-if="summary.total > 0" :column="2" border class="mb-4">
      <el-descriptions-item label="参考样本数">
        {{ summary.total }}
        <span v-if="filterSummary" class="text-sm text-gray-500">（{{ filterSummary }}）</span>
      </el-descriptions-item>
      <el-descriptions-item v-if="summary.medianWordCount != null" label="竞品字数">
        中位 {{ summary.medianWordCount }} 词
        <span v-if="summary.minWordCount != null && summary.maxWordCount != null" class="text-sm text-gray-500">
          （{{ summary.minWordCount }}–{{ summary.maxWordCount }}）
        </span>
      </el-descriptions-item>
      <el-descriptions-item v-if="summary.targetWordCount" label="大纲目标字数" :span="2">
        {{ summary.targetWordCount }} 词
        <span v-if="summary.wordCountHint" class="ml-2 text-sm text-gray-600">
          {{ summary.wordCountHint }}
        </span>
      </el-descriptions-item>
    </el-descriptions>

    <div v-if="contentGaps.length" class="mb-4">
      <div class="mb-2 font-medium">大纲差异化角度（对照竞品缺口）</div>
      <ul class="list-disc pl-5 space-y-1 text-sm text-gray-700">
        <li v-for="(gap, i) in contentGaps" :key="i">{{ gap }}</li>
      </ul>
    </div>

    <el-table
      v-if="summary.rows.length"
      :data="summary.rows"
      stripe
      style="width: 100%"
      row-key="link"
      :default-expand-all="false"
    >
      <el-table-column type="expand">
        <template #default="{ row }">
          <div class="px-4 py-2 space-y-3 text-sm">
            <div v-if="row.headings.length">
              <div class="mb-1 font-medium text-gray-700">标题结构（H1–H3）</div>
              <ul class="list-disc pl-5 space-y-1">
                <li v-for="(heading, i) in row.headings" :key="i">{{ heading }}</li>
              </ul>
            </div>
            <div v-if="row.excerpt">
              <div class="mb-1 font-medium text-gray-700">正文摘录</div>
              <p class="text-gray-600 leading-relaxed whitespace-pre-wrap">{{ row.excerpt }}</p>
            </div>
            <p v-if="row.scrapeError" class="text-amber-600">抓取失败：{{ row.scrapeError }}</p>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="position" label="#" width="56" />
      <el-table-column prop="title" label="标题" min-width="180" show-overflow-tooltip>
        <template #default="{ row }">
          <el-link
            v-if="row.link"
            :href="row.link"
            target="_blank"
            type="primary"
            :underline="false"
          >
            {{ row.title }}
          </el-link>
          <span v-else>{{ row.title }}</span>
        </template>
      </el-table-column>
      <el-table-column label="抓取" width="120" show-overflow-tooltip>
        <template #default="{ row }">
          <el-tag v-if="row.scraped" type="success" size="small">成功</el-tag>
          <el-tag v-else-if="row.scrapeError" type="danger" size="small" effect="plain">
            {{ formatScrapeErrorShort(row.scrapeError) }}
          </el-tag>
          <span v-else class="text-gray-400">未抓取</span>
        </template>
      </el-table-column>
      <el-table-column label="字数" width="72" align="center">
        <template #default="{ row }">
          <span v-if="row.wordCount != null">{{ row.wordCount }}</span>
          <span v-else class="text-gray-400">-</span>
        </template>
      </el-table-column>
      <el-table-column label="H 标签" width="72" align="center">
        <template #default="{ row }">
          <span v-if="row.scraped">{{ row.headingCount }}</span>
          <span v-else class="text-gray-400">-</span>
        </template>
      </el-table-column>
      <el-table-column prop="snippet" label="摘要" min-width="200" show-overflow-tooltip />
    </el-table>

    <el-empty v-else description="暂无搜索结果（任务进行中或检索失败）" />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { summarizeCompetitorSerp } from "@wm/shared-core";
import type { ArticleJobBriefData, ArticleJobSerpData } from "@/api/seo-factory/types";
import type { RefreshArticleJobSerpPayload } from "@/api/seo-factory/article-job";

defineOptions({ name: "ArticleJobCompetitorPanel" });

const props = defineProps<{
  serpData?: ArticleJobSerpData | null;
  briefData?: ArticleJobBriefData | null;
  refreshing?: boolean;
  showRefreshAction?: boolean;
}>();

const emit = defineEmits<{
  refresh: [payload?: RefreshArticleJobSerpPayload];
}>();

const filterMeta = computed(() => props.serpData?.filterMeta ?? null);

const filterSummary = computed(() => {
  const meta = filterMeta.value;
  if (!meta) return "";
  const parts = [`Google 前 ${meta.total} 条`];
  if (meta.articlesOnly) {
    parts.push(`标准文章 ${meta.articleKept ?? meta.kept} 篇`);
    if (meta.nonArticleExcluded) parts.push(`已排除非文章 ${meta.nonArticleExcluded} 条`);
    if (meta.scrapeFailedExcluded) parts.push(`已排除抓取失败 ${meta.scrapeFailedExcluded} 条`);
  } else {
    parts.push("含产品页等全部结果");
  }
  return parts.join("，");
});

const lowSampleWarning = computed(() => {
  const meta = filterMeta.value;
  if (!meta || meta.kept >= 3) return null;
  if (meta.articlesOnly) {
    return {
      title: `仅找到 ${meta.kept} 条可参考结果，样本偏少`,
      description:
        "这类搜索词前排的标准文章较少。可在「设置」调高 Google 抓取条数；系统不会用论坛、问答、产品页或公司页凑数。"
    };
  }
  return {
    title: `仅找到 ${meta.kept} 条可参考结果`,
    description: "该词的 Google 前排结果本身较少，大纲会主要依据现有样本与 AI 行业知识生成。"
  };
});

const targetWordCount = computed(
  () => props.briefData?.outline?.targetWordCount ?? null
);

const contentGaps = computed(() => props.briefData?.outline?.contentGaps ?? []);

const summary = computed(() =>
  summarizeCompetitorSerp(props.serpData?.organic, {
    targetWordCount: targetWordCount.value,
    scrapeMeta: props.serpData?.competitorScrapeMeta ?? null
  })
);

const scrapeFailureDescription = computed(() => {
  const parts: string[] = [];
  parts.push(`已尝试 ${summary.value.scrapeFailedCount || summary.value.total} 条竞品链接`);
  if (summary.value.scrapeErrorSamples.length) {
    parts.push(`常见原因：${summary.value.scrapeErrorSamples.join("；")}`);
  }
  parts.push("可点「重新分析搜索结果」重试；若持续失败请检查 API 代理（HTTPS_PROXY）或目标站反爬");
  return parts.join("。");
});

const scrapeSuccessDescription = computed(() => {
  const parts: string[] = [];
  if (summary.value.scrapeFailedCount > 0 && summary.value.scrapeErrorSamples.length) {
    parts.push(`失败原因：${summary.value.scrapeErrorSamples.join("；")}`);
  }
  if (summary.value.wordCountHint) {
    parts.push(summary.value.wordCountHint);
  }
  return parts.join("；") || "可展开各行查看标题结构与正文摘录。";
});

function formatScrapeErrorShort(error: string): string {
  if (error.startsWith("HTTP ")) return error;
  if (error.includes("fetch failed")) return "网络失败";
  if (error.includes("proxy") || error.includes("Proxy") || error.includes("Clash")) return "代理异常";
  if (error.length <= 12) return error;
  return `${error.slice(0, 10)}…`;
}
</script>
