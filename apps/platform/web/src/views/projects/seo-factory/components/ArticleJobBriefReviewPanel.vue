<!--
  Brief 人工确认：编辑大纲并触发初稿。

  边界：
  - 不负责：Brief LLM 生成
-->
<template>
  <div v-if="pending" class="space-y-4">
    <el-alert
      type="warning"
      :closable="false"
      show-icon
      title="大纲待确认"
      description="请核对大纲方向后再生成初稿。"
    />

    <el-form label-width="96px">
      <el-form-item label="文章标题">
        <el-input v-model="form.title" maxlength="200" show-word-limit />
      </el-form-item>
      <el-form-item label="搜索意图">
        <el-input v-model="form.searchIntent" maxlength="64" />
      </el-form-item>
      <el-form-item label="目标字数">
        <el-input-number v-model="form.targetWordCount" :min="400" :max="5000" />
      </el-form-item>
      <el-form-item label="章节大纲">
        <div class="w-full space-y-3">
          <div
            v-for="(section, index) in form.outline"
            :key="index"
            class="rounded border border-gray-200 p-3"
          >
            <el-input v-model="section.heading" placeholder="H2 标题" class="mb-2" />
            <el-input
              v-model="section.pointsText"
              type="textarea"
              :rows="3"
              placeholder="要点，每行一条"
            />
          </div>
        </div>
      </el-form-item>
      <el-form-item label="Content Gaps">
        <el-input
          v-model="form.contentGapsText"
          type="textarea"
          :rows="4"
          placeholder="差异化角度，每行一条"
        />
      </el-form-item>
      <el-form-item label="FAQ 规划">
        <el-input
          v-model="form.faqCandidatesText"
          type="textarea"
          :rows="4"
          placeholder="读者常见问题，每行一题（4–6 题）"
        />
      </el-form-item>
      <el-form-item label="精选摘要 H2">
        <el-input v-model="form.snippetHeading" placeholder="可直接回答主查询的 H2 标题" />
      </el-form-item>
      <el-form-item label="摘要字数上限">
        <el-input-number v-model="form.snippetAnswerMaxWords" :min="30" :max="80" />
      </el-form-item>
    </el-form>

    <div class="flex flex-wrap gap-2">
      <el-button type="primary" :loading="saving" @click="handleSave">保存修改</el-button>
      <el-button type="success" :loading="approving" @click="handleApprove">
        确认并生成初稿
      </el-button>
      <el-button :loading="regenerating" @click="handleRegenerate">重新生成大纲</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import type { ArticleJobBriefData, ArticleJobItem } from "@/api/seo-factory/types";
import {
  approveArticleBrief,
  patchArticleBrief,
  regenerateArticleBrief
} from "@/api/seo-factory/article-job";
import { message } from "@/utils/message";

defineOptions({ name: "ArticleJobBriefReviewPanel" });

const props = defineProps<{
  projectId: string;
  jobId: string;
  briefData?: ArticleJobBriefData | null;
}>();

const emit = defineEmits<{
  updated: [];
}>();

const pending = computed(() => props.briefData?.approvalStatus === "pending");

const form = reactive({
  title: "",
  searchIntent: "",
  targetWordCount: 1400,
  outline: [] as Array<{ heading: string; pointsText: string }>,
  contentGapsText: "",
  faqCandidatesText: "",
  snippetHeading: "",
  snippetAnswerMaxWords: 55
});

const saving = ref(false);
const approving = ref(false);
const regenerating = ref(false);

watch(
  () => props.briefData,
  (brief) => {
    const outline = brief?.outline;
    form.title = outline?.title ?? "";
    form.searchIntent = outline?.searchIntent ?? "";
    form.targetWordCount = outline?.targetWordCount ?? 1400;
    form.outline = (outline?.outline ?? []).map((section) => ({
      heading: section.heading,
      pointsText: (section.points ?? []).join("\n")
    }));
    form.contentGapsText = (outline?.contentGaps ?? []).join("\n");
    form.faqCandidatesText = (outline?.faqCandidates ?? []).join("\n");
    form.snippetHeading = outline?.featuredSnippetTarget?.heading ?? "";
    form.snippetAnswerMaxWords = outline?.featuredSnippetTarget?.answerMaxWords ?? 55;
  },
  { immediate: true, deep: true }
);

function buildPayload() {
  return {
    title: form.title.trim(),
    searchIntent: form.searchIntent.trim(),
    targetWordCount: form.targetWordCount,
    outline: form.outline
      .filter((section) => section.heading.trim())
      .map((section) => ({
        heading: section.heading.trim(),
        points: section.pointsText
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
      })),
    contentGaps: form.contentGapsText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
    faqCandidates: form.faqCandidatesText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
    featuredSnippetTarget: form.snippetHeading.trim()
      ? {
          heading: form.snippetHeading.trim(),
          answerMaxWords: form.snippetAnswerMaxWords
        }
      : undefined
  };
}

async function handleSave() {
  saving.value = true;
  try {
    await patchArticleBrief(props.projectId, props.jobId, buildPayload());
    message("大纲已保存", { type: "success" });
    emit("updated");
  } catch (error) {
    message(error instanceof Error ? error.message : "保存失败", { type: "error" });
  } finally {
    saving.value = false;
  }
}

async function handleApprove() {
  approving.value = true;
  try {
    await patchArticleBrief(props.projectId, props.jobId, buildPayload());
    await approveArticleBrief(props.projectId, props.jobId);
    message("已确认大纲，正在生成初稿…", { type: "success" });
    emit("updated");
  } catch (error) {
    message(error instanceof Error ? error.message : "确认失败", { type: "error" });
  } finally {
    approving.value = false;
  }
}

async function handleRegenerate() {
  regenerating.value = true;
  try {
    await regenerateArticleBrief(props.projectId, props.jobId);
    message("正在重新生成大纲…", { type: "success" });
    emit("updated");
  } catch (error) {
    message(error instanceof Error ? error.message : "操作失败", { type: "error" });
  } finally {
    regenerating.value = false;
  }
}
</script>
