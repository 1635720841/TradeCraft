<!--
  Brief 大纲展示：标题、搜索意图、章节要点。

  边界：
  - 不负责：数据拉取（由父组件传入 briefData）
-->
<template>
  <div>
    <template v-if="outline">
      <el-descriptions :column="2" border class="mb-4">
        <el-descriptions-item v-if="outline.title" label="文章标题" :span="2">
          {{ outline.title }}
        </el-descriptions-item>
        <el-descriptions-item v-if="outline.searchIntent" label="搜索意图">
          {{ outline.searchIntent }}
        </el-descriptions-item>
        <el-descriptions-item v-if="outline.targetWordCount" label="目标字数">
          {{ outline.targetWordCount }}
        </el-descriptions-item>
      </el-descriptions>

      <div v-if="sections.length" class="mb-4">
        <div class="mb-2 font-medium">章节大纲</div>
        <el-collapse>
          <el-collapse-item
            v-for="(section, index) in sections"
            :key="index"
            :title="section.heading"
            :name="index"
          >
            <ul v-if="section.points?.length" class="list-disc pl-5 space-y-1">
              <li v-for="(point, i) in section.points" :key="i">{{ point }}</li>
            </ul>
            <span v-else class="text-gray-400">无要点</span>
          </el-collapse-item>
        </el-collapse>
      </div>

      <div v-if="contentGaps.length">
        <div class="mb-2 font-medium">内容差异化</div>
        <ul class="list-disc pl-5 space-y-1 text-sm">
          <li v-for="(gap, i) in contentGaps" :key="i">{{ gap }}</li>
        </ul>
      </div>

      <div v-if="faqCandidates.length" class="mt-4">
        <div class="mb-2 font-medium">FAQ 规划</div>
        <ul class="list-disc pl-5 space-y-1 text-sm">
          <li v-for="(item, i) in faqCandidates" :key="i">{{ item }}</li>
        </ul>
      </div>

      <div v-if="featuredSnippetTarget?.heading" class="mt-4">
        <div class="mb-2 font-medium">精选摘要目标</div>
        <p class="text-sm text-gray-700">
          H2「{{ featuredSnippetTarget.heading }}」— 首段直接回答，≤
          {{ featuredSnippetTarget.answerMaxWords ?? 55 }} 词
        </p>
      </div>
    </template>

    <el-empty v-else description="暂无大纲数据（尚未进入撰写阶段）" />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ArticleJobBriefData } from "@/api/seo-factory/types";

defineOptions({ name: "ArticleJobBriefPanel" });

const props = defineProps<{
  briefData?: ArticleJobBriefData | null;
}>();

const outline = computed(() => props.briefData?.outline);
const sections = computed(() => outline.value?.outline ?? []);
const contentGaps = computed(() => outline.value?.contentGaps ?? []);
const faqCandidates = computed(() => outline.value?.faqCandidates ?? []);
const featuredSnippetTarget = computed(() => outline.value?.featuredSnippetTarget);
</script>
