<!--
  稿件手动编辑表单：标题、Meta、所见即所得正文 + 实时预览。

  边界：
  - 不负责：保存逻辑（由父组件 JobDetailView 处理）
 -->
<template>
  <el-form label-position="top" class="draft-editor-form">
    <el-row :gutter="16">
      <el-col :xs="24" :xl="12">
        <el-row :gutter="16">
          <el-col :span="24">
            <el-form-item label="标题">
              <el-input v-model="form.title" maxlength="200" show-word-limit />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="Meta Description">
              <el-input
                v-model="form.metaDescription"
                type="textarea"
                :rows="2"
                maxlength="320"
                show-word-limit
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="正文" class="draft-content-item">
          <ArticleJobDraftHtmlEditor
            v-model:markdown="form.content"
            :project-id="projectId"
            :job-id="jobId"
            :article-images="articleImages"
            :disabled="Boolean(editBlockedReason)"
            @quick-save="emit('save')"
          />
        </el-form-item>
      </el-col>

      <el-col :xs="24" :xl="12">
        <div class="draft-live-preview">
          <div class="mb-2 text-sm font-medium text-gray-700">实时预览</div>
          <div class="draft-live-preview__panel rounded border border-gray-200 bg-gray-50 p-4">
            <el-descriptions v-if="form.title || form.metaDescription" :column="1" border class="mb-4" size="small">
              <el-descriptions-item v-if="form.title" label="标题">
                {{ form.title }}
              </el-descriptions-item>
              <el-descriptions-item v-if="form.metaDescription" label="Meta">
                {{ form.metaDescription }}
              </el-descriptions-item>
            </el-descriptions>
            <ArticleJobDraftHtmlBody v-if="form.content.trim()" :content="form.content" />
            <el-empty v-else description="正文为空" :image-size="64" />
          </div>
        </div>
      </el-col>
    </el-row>

    <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-500">
      <span>{{ wordCount }} 词</span>
      <span>{{ form.content.length }} 字符</span>
      <el-tag v-if="isDirty" type="warning" size="small" effect="plain">有未保存修改</el-tag>
    </div>

    <div class="mt-4 flex flex-wrap items-center gap-2">
      <el-button type="primary" :loading="saving" :disabled="!canSave || !isDirty" @click="emit('save')">
        保存
      </el-button>
      <el-button :loading="saving" :disabled="!canSave || !isDirty" @click="emit('save-preview')">
        保存并预览
      </el-button>
      <el-button link type="primary" :disabled="!canSave || !isDirty" @click="emit('save-advanced')">
        保存选项…
      </el-button>
      <el-button :disabled="saving" @click="emit('cancel')">取消</el-button>
      <span v-if="editBlockedReason" class="text-sm text-amber-600">{{ editBlockedReason }}</span>
    </div>
  </el-form>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import type { ArticleJobArticleImage, ArticleJobDraftData } from "@/api/seo-factory/types";
import { countDraftWords, isDraftFormDirty } from "@/utils/seo-factory/draft-edit-preview";
import ArticleJobDraftHtmlBody from "./ArticleJobDraftHtmlBody.vue";
import ArticleJobDraftHtmlEditor from "./ArticleJobDraftHtmlEditor.vue";

defineOptions({ name: "ArticleJobDraftEditor" });

const props = defineProps<{
  projectId: string;
  jobId: string;
  draftData?: ArticleJobDraftData | null;
  articleImages?: ArticleJobArticleImage[];
  saving?: boolean;
  canSave?: boolean;
  editBlockedReason?: string;
}>();

const emit = defineEmits<{
  save: [];
  "save-preview": [];
  "save-advanced": [];
  cancel: [];
  change: [];
}>();

const baseline = reactive({
  title: "",
  metaDescription: "",
  content: ""
});

const form = reactive({
  title: "",
  metaDescription: "",
  content: ""
});

function syncFromDraft(draft: ArticleJobDraftData | null | undefined) {
  const title = draft?.title ?? "";
  const metaDescription = draft?.metaDescription ?? "";
  const content = draft?.content ?? "";
  form.title = title;
  form.metaDescription = metaDescription;
  form.content = content;
  baseline.title = title;
  baseline.metaDescription = metaDescription;
  baseline.content = content;
}

const isDirty = computed(() =>
  isDraftFormDirty(baseline, {
    title: form.title.trim(),
    metaDescription: form.metaDescription.trim(),
    content: form.content.trim()
  })
);

watch(
  () => props.draftData,
  (draft) => {
    if (isDirty.value) return;
    syncFromDraft(draft);
  },
  { immediate: true }
);

watch(form, () => emit("change"), { deep: true });

const wordCount = computed(() => countDraftWords(form.content));

function getPayload() {
  return {
    title: form.title.trim(),
    metaDescription: form.metaDescription.trim(),
    content: form.content.trim()
  };
}

function markSaved() {
  const payload = getPayload();
  baseline.title = payload.title;
  baseline.metaDescription = payload.metaDescription;
  baseline.content = payload.content;
}

defineExpose({ getPayload, isDirty, markSaved });
</script>

<style scoped>
.draft-content-item :deep(.el-form-item__content) {
  width: 100%;
}

.draft-live-preview__panel {
  max-height: min(78vh, 900px);
  overflow: auto;
}

@media (min-width: 1280px) {
  .draft-live-preview {
    position: sticky;
    top: 0.5rem;
  }
}
</style>
