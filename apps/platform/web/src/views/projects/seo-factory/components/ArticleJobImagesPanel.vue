<!--
  配图植入结果展示与人工管理。

  边界：
  - 不负责：BFL 工作流自动配图（后端 illustration 模块）
-->
<template>
  <div>
    <el-alert
      v-if="illustrationError"
      class="mb-4"
      type="error"
      :closable="false"
      show-icon
      title="配图生成失败"
      :description="illustrationError"
    />

    <el-alert
      v-if="!applied"
      type="info"
      :closable="false"
      show-icon
      title="尚未完成配图植入"
      :description="
        illustrationError
          ? '自动配图未成功，请使用下方按钮手动上传或按描述生成。'
          : '工作流在 Semrush 终检前会自动补足 SWA 所需图片；若长时间无图，可手动补充。'
      "
    />

    <el-alert
      v-if="applied && !meetsSwa"
      class="mb-4"
      type="warning"
      :closable="false"
      show-icon
      title="图片数量不足 SWA 要求"
      :description="`当前 ${images.length} 张，建议至少 ${SWA_MIN_IMAGES} 张。`"
    />

    <el-descriptions v-if="applied" :column="2" border class="mb-4">
      <el-descriptions-item label="植入状态">
        <el-tag :type="meetsSwa ? 'success' : 'warning'">
          {{ meetsSwa ? "已完成" : "图片不足" }}
        </el-tag>
      </el-descriptions-item>
      <el-descriptions-item label="图片数量">
        {{ images.length }} / {{ SWA_MIN_IMAGES }}（SWA 最低）
      </el-descriptions-item>
    </el-descriptions>

    <el-alert
      v-if="!editable"
      class="mb-4"
      type="warning"
      :closable="false"
      show-icon
      title="任务进行中"
      description="配图处理或 SEO 优化进行中，请稍后再编辑。"
    />

    <div v-if="editable" class="mb-4 flex flex-wrap gap-2">
      <el-button type="primary" @click="openGenerateDialog">按描述生成</el-button>
      <el-button @click="triggerUploadAdd">上传添加</el-button>
      <el-button v-if="applied || illustrationError" :loading="reapplying" @click="handleReapply">
        重跑自动配图
      </el-button>
    </div>

    <input
      ref="fileInputRef"
      type="file"
      accept="image/jpeg,image/png,image/webp,image/gif"
      class="hidden"
      @change="handleFileChange"
    />

    <div v-if="images.length" class="article-images-grid">
        <article
          v-for="(image, index) in images"
          :key="`${image.url}-${index}`"
          class="article-images-card"
        >
          <img
            :src="image.url"
            :alt="image.alt"
            class="article-images-card__thumb"
          />
          <div class="article-images-card__body">
            <div class="article-images-card__alt">{{ image.alt || "无 Alt" }}</div>
            <div v-if="image.insertAfterHeading" class="article-images-card__meta">
              章节：{{ image.insertAfterHeading }}
            </div>
            <el-tag size="small" :type="sourceTagType(image.source)">
              {{ sourceLabel(image.source) }}
            </el-tag>
          </div>
          <div v-if="editable" class="article-images-card__actions">
            <el-button size="small" :loading="regeneratingIndex === index" @click="openRegenerateDialog(index)">
              重新生成
            </el-button>
            <el-button size="small" @click="triggerUploadReplace(index)">上传替换</el-button>
            <el-button size="small" type="danger" link @click="handleRemove(index)">删除</el-button>
          </div>
        </article>
      </div>

      <el-empty v-else-if="editable" description="暂无配图，可上传或按描述生成" />
      <el-empty v-else description="请等待工作流完成配图步骤" />

    <ArticleJobImagePromptDialog
      v-model="promptDialogOpen"
      :mode="promptDialogMode"
      :initial-prompt="promptDialogInitial"
      :heading-options="headingOptions"
      :submitting="promptSubmitting"
      @submit="handlePromptSubmit"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { ArticleJobArticleImage } from "@/api/seo-factory/types";
import {
  generateArticleImage,
  patchArticleImages,
  reapplyArticleImages,
  regenerateArticleImage,
  uploadArticleDraftImage
} from "@/api/seo-factory/article-job";
import { ElMessageBox } from "element-plus";
import { message } from "@/utils/message";
import { extractHttpErrorMessage } from "@/utils/http-error";
import ArticleJobImagePromptDialog from "./ArticleJobImagePromptDialog.vue";

defineOptions({ name: "ArticleJobImagesPanel" });

const SWA_MIN_IMAGES = 2;

const IMAGE_MUTATION_BLOCKED_STATUSES = new Set([
  "QUEUED",
  "RESEARCHING",
  "DRAFTING",
  "LINKING",
  "ILLUSTRATING",
  "OPTIMIZING"
]);

const props = defineProps<{
  projectId?: string;
  jobId?: string;
  targetKeyword?: string;
  draftContent?: string | null;
  articleImages?: ArticleJobArticleImage[] | null;
  imagesApplied?: boolean;
  illustrationError?: string | null;
  jobStatus?: string;
}>();

const emit = defineEmits<{
  updated: [];
}>();

const applied = computed(() => props.imagesApplied === true);
const images = computed(() => props.articleImages ?? []);
const meetsSwa = computed(() => images.value.length >= SWA_MIN_IMAGES);
const hasDraftContent = computed(() => Boolean(props.draftContent?.trim()));
const editable = computed(() => {
  if (!props.projectId || !props.jobId || !hasDraftContent.value) return false;
  if (props.jobStatus && IMAGE_MUTATION_BLOCKED_STATUSES.has(props.jobStatus)) return false;
  return true;
});

const headingOptions = computed(() => {
  const content = props.draftContent ?? "";
  return [...content.matchAll(/^##\s+(.+)$/gm)]
    .map((match) => match[1]?.trim())
    .filter((heading): heading is string => Boolean(heading));
});

const fileInputRef = ref<HTMLInputElement | null>(null);
const uploadTargetIndex = ref<number | null>(null);
const reapplying = ref(false);
const regeneratingIndex = ref<number | null>(null);
const promptDialogOpen = ref(false);
const promptDialogMode = ref<"generate" | "regenerate">("generate");
const promptDialogInitial = ref("");
const promptRegenerateIndex = ref<number | null>(null);
const promptSubmitting = ref(false);

function sourceLabel(source: ArticleJobArticleImage["source"]) {
  if (source === "upload") return "本地上传";
  if (source === "url") return "外链";
  return "AI 生成";
}

function sourceTagType(source: ArticleJobArticleImage["source"]) {
  if (source === "upload") return "info";
  if (source === "url") return "warning";
  return "success";
}

function buildDefaultPrompt(index: number, image?: ArticleJobArticleImage, section?: string) {
  const keyword = props.targetKeyword?.trim() || "industry";
  const sectionRaw = image?.insertAfterHeading?.trim() || section?.trim();
  const sectionLower = sectionRaw?.toLowerCase() ?? "";
  const isOverview = /^what\s+(?:is|are)\b/.test(sectionLower);
  const isMechanism = /^how\s+(?:does|do)\b/.test(sectionLower);
  const hasDroneBms = /\b(uav|drone|bms|battery management)\b/i.test(`${keyword} ${sectionRaw ?? ""}`);

  let subject: string;
  if (hasDroneBms && isOverview) {
    subject =
      "multirotor quadcopter drone beside a detachable lithium polymer battery pack with visible power management electronics";
  } else if (hasDroneBms && isMechanism) {
    subject =
      "lithium battery cells wired to a compact green printed circuit board with balance leads and gold power connectors";
  } else {
    const topic = sectionRaw
      ? sectionRaw
          .replace(/^(what\s+(?:is|are)\s+(?:a[n]?\s+)?|how\s+(?:to|do|does)\s+(?:a[n]?\s+)?)/i, "")
          .replace(/\?+$/g, "")
          .replace(/\s+(work|works)\.?$/i, "")
          .trim()
      : keyword;
    subject = `${topic} equipment and components related to ${keyword}`;
  }

  const shots = isMechanism
    ? [
        `Macro close-up of ${subject}`,
        `Exploded-view arrangement of ${subject} on a neutral gray surface`
      ]
    : [
        `Professional product photograph of ${subject} on a clean white engineering workbench`,
        `Wide establishing shot of ${subject} in a bright technical laboratory`,
        `Close-up detail of ${subject}`
      ];
  return `${shots[index % shots.length]}, variation ${index + 1}`;
}

function toPatchPayload(list: ArticleJobArticleImage[]) {
  return {
    articleImages: list.map((image) => ({
      alt: image.alt,
      url: image.url,
      source: image.source,
      insertAfterHeading: image.insertAfterHeading
    }))
  };
}

function openGenerateDialog() {
  promptDialogMode.value = "generate";
  promptRegenerateIndex.value = null;
  promptDialogInitial.value = buildDefaultPrompt(
    images.value.length,
    undefined,
    headingOptions.value[0]
  );
  promptDialogOpen.value = true;
}

function openRegenerateDialog(index: number) {
  promptDialogMode.value = "regenerate";
  promptRegenerateIndex.value = index;
  promptDialogInitial.value = buildDefaultPrompt(index, images.value[index]);
  promptDialogOpen.value = true;
}

function triggerUploadAdd() {
  uploadTargetIndex.value = null;
  fileInputRef.value?.click();
}

function triggerUploadReplace(index: number) {
  uploadTargetIndex.value = index;
  fileInputRef.value?.click();
}

async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || !props.projectId || !props.jobId) return;

  try {
    const uploaded = await uploadArticleDraftImage(props.projectId, props.jobId, file);
    const alt = file.name.replace(/\.[^.]+$/, "");
    const next = [...images.value];

    if (uploadTargetIndex.value === null) {
      next.push({
        alt,
        url: uploaded.url,
        source: "upload"
      });
    } else {
      const index = uploadTargetIndex.value;
      const previous = next[index];
      if (!previous) return;
      next[index] = {
        ...previous,
        alt: previous.alt || alt,
        url: uploaded.url,
        source: "upload"
      };
    }

    await patchArticleImages(props.projectId, props.jobId, toPatchPayload(next));
    message(uploadTargetIndex.value === null ? "配图已添加" : "配图已替换", { type: "success" });
    emit("updated");
  } catch (error) {
    message(extractHttpErrorMessage(error, "上传失败"), { type: "error" });
  } finally {
    uploadTargetIndex.value = null;
  }
}

async function handleRemove(index: number) {
  if (!props.projectId || !props.jobId) return;

  try {
    await ElMessageBox.confirm("确定删除这张配图？正文中的图片引用将一并移除。", "删除配图", {
      type: "warning",
      confirmButtonText: "删除",
      cancelButtonText: "取消"
    });
  } catch {
    return;
  }

  const next = images.value.filter((_, i) => i !== index);
  try {
    await patchArticleImages(props.projectId, props.jobId, toPatchPayload(next));
    message("配图已删除", { type: "success" });
    emit("updated");
  } catch (error) {
    message(extractHttpErrorMessage(error, "删除失败"), { type: "error" });
  }
}

async function handlePromptSubmit(payload: {
  prompt: string;
  alt?: string;
  insertAfterHeading?: string;
}) {
  if (!props.projectId || !props.jobId) return;

  promptSubmitting.value = true;
  try {
    if (promptDialogMode.value === "generate") {
      await generateArticleImage(props.projectId, props.jobId, payload);
      message("配图已生成并插入正文", { type: "success" });
    } else if (promptRegenerateIndex.value !== null) {
      regeneratingIndex.value = promptRegenerateIndex.value;
      await regenerateArticleImage(
        props.projectId,
        props.jobId,
        promptRegenerateIndex.value,
        { prompt: payload.prompt }
      );
      message("配图已重新生成", { type: "success" });
    }
    promptDialogOpen.value = false;
    emit("updated");
  } catch (error) {
    message(extractHttpErrorMessage(error, "生成失败"), { type: "error" });
  } finally {
    promptSubmitting.value = false;
    regeneratingIndex.value = null;
  }
}

async function handleReapply() {
  if (!props.projectId || !props.jobId) return;

  try {
    await ElMessageBox.confirm(
      "将清除现有 AI 配图并重新自动补足（本地上传的图片会保留）。是否继续？",
      "重跑自动配图",
      { type: "warning", confirmButtonText: "继续", cancelButtonText: "取消" }
    );
  } catch {
    return;
  }

  reapplying.value = true;
  try {
    await reapplyArticleImages(props.projectId, props.jobId);
    message("自动配图已重跑", { type: "success" });
    emit("updated");
  } catch (error) {
    message(extractHttpErrorMessage(error, "重跑失败"), { type: "error" });
  } finally {
    reapplying.value = false;
  }
}
</script>

<style scoped lang="scss">
.article-images-grid {
  display: grid;
  gap: 12px;
}

.article-images-card {
  display: grid;
  grid-template-columns: 120px 1fr auto;
  gap: 12px;
  align-items: start;
  padding: 12px;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  background: var(--el-fill-color-blank);
}

.article-images-card__thumb {
  width: 120px;
  height: 80px;
  object-fit: cover;
  border-radius: 4px;
  background: var(--el-fill-color-light);
}

.article-images-card__body {
  min-width: 0;
}

.article-images-card__alt {
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 4px;
  word-break: break-word;
}

.article-images-card__meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 6px;
}

.article-images-card__actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-end;
}

.hidden {
  display: none;
}
</style>
