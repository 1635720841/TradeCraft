<!--
  初稿 Markdown 预览：解析常见标题与列表并渲染。

  边界：
  - 不负责：完整 Markdown 语法（代码块、表格等）
-->
<template>
  <div class="job-article-chrome">
    <template v-if="draft">
      <div class="job-article-chrome__toolbar">
        <div v-if="showCurrentLabel" class="job-article-chrome__version-label">
          当前版本
        </div>
        <div class="job-article-chrome__actions">
          <el-button
            type="primary"
            size="small"
            :disabled="!canRewrite || rewriting"
            :loading="rewriting"
            @click="emit('rewrite')"
          >
            AI 重写
          </el-button>
          <span v-if="!canRewrite" class="job-article-chrome__hint"
            >需先有初稿内容</span
          >
          <span v-else-if="rewriting" class="job-article-chrome__hint"
            >AI 重写中，约 30–90 秒…</span
          >
          <span
            v-else-if="rewriteBlockedReason"
            class="job-article-chrome__hint is-warn"
          >
            {{ rewriteBlockedReason }}
          </span>
        </div>
      </div>

      <div
        v-if="metaTitle || metaDescription"
        class="job-article-chrome__serp-preview"
      >
        <div class="job-article-chrome__serp-head">
          <IconifyIconOnline icon="ri:search-eye-line" />
          <span>搜索结果预览</span>
        </div>
        <div class="job-article-chrome__serp-url">{{ displayUrl }}</div>
        <h2>{{ metaTitle || targetKeyword || "未填写标题" }}</h2>
        <p>{{ metaDescription || "未填写 Meta Description" }}</p>
      </div>

      <div class="job-article-chrome__seo-bar">
        <div class="job-article-chrome__seo-item">
          <span class="job-article-chrome__seo-label">标题</span>
          <span class="job-article-chrome__seo-value">{{
            metaTitle || "（未填写）"
          }}</span>
        </div>
        <div class="job-article-chrome__seo-item">
          <span class="job-article-chrome__seo-label">Meta Description</span>
          <span class="job-article-chrome__seo-value">{{
            metaDescription || "（未填写）"
          }}</span>
        </div>
        <div
          v-if="wordCount != null"
          class="job-article-chrome__seo-item job-article-chrome__seo-item--compact"
        >
          <span class="job-article-chrome__seo-label">字数</span>
          <span class="job-article-chrome__seo-value">{{ wordCount }} 词</span>
        </div>
        <div
          v-if="readMinutes != null"
          class="job-article-chrome__seo-item job-article-chrome__seo-item--compact"
        >
          <span class="job-article-chrome__seo-label">阅读</span>
          <span class="job-article-chrome__seo-value"
            >约 {{ readMinutes }} 分钟</span
          >
        </div>
      </div>

      <article v-if="draft.content?.trim()" class="job-article-chrome__body">
        <ArticleJobDraftHtmlBody :content="draft.content" />
      </article>

      <el-empty v-else description="初稿正文为空" />
    </template>

    <el-empty v-else description="暂无初稿（尚未进入撰写阶段）" />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type {
  ArticleJobBriefData,
  ArticleJobDraftData
} from "@/api/seo-factory/types";
import {
  countDraftWords,
  resolveDraftTitleAndMeta
} from "@/utils/seo-factory/draft-edit-preview";
import ArticleJobDraftHtmlBody from "./ArticleJobDraftHtmlBody.vue";

defineOptions({ name: "ArticleJobDraftPreview" });

const props = defineProps<{
  draftData?: ArticleJobDraftData | null;
  briefData?: ArticleJobBriefData | null;
  siteDomain?: string | null;
  targetKeyword?: string | null;
  canRewrite?: boolean;
  rewriting?: boolean;
  rewriteBlockedReason?: string;
  showCurrentLabel?: boolean;
}>();

const emit = defineEmits<{
  rewrite: [];
}>();

const draft = computed(() => props.draftData);
const resolvedMeta = computed(() =>
  resolveDraftTitleAndMeta(props.draftData, props.briefData)
);
const metaTitle = computed(() => resolvedMeta.value.title);
const metaDescription = computed(() => resolvedMeta.value.metaDescription);
const displayUrl = computed(() => {
  const domain =
    props.siteDomain?.replace(/^https?:\/\//, "").replace(/\/$/, "") ||
    "example.com";
  const slug = (props.targetKeyword || metaTitle.value || "seo-article")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${domain}/${slug || "seo-article"}`;
});

const wordCount = computed(() => {
  const content = draft.value?.content ?? "";
  return content.trim() ? countDraftWords(content) : null;
});

const readMinutes = computed(() =>
  wordCount.value != null && wordCount.value > 0
    ? Math.max(1, Math.ceil(wordCount.value / 250))
    : null
);
</script>
