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
        <el-descriptions-item v-if="promptVersion" label="Prompt 版本">
          {{ promptVersion }}
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
        <div class="mb-2 font-medium">内容差异化（Content Gaps）</div>
        <ul class="list-disc pl-5 space-y-1 text-sm">
          <li v-for="(gap, i) in contentGaps" :key="i">{{ gap }}</li>
        </ul>
      </div>
    </template>

    <el-empty v-else description="暂无 Brief 数据（尚未进入撰写阶段）" />
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
const promptVersion = computed(() => props.briefData?.promptVersion);
const sections = computed(() => outline.value?.outline ?? []);
const contentGaps = computed(() => outline.value?.contentGaps ?? []);
</script>
