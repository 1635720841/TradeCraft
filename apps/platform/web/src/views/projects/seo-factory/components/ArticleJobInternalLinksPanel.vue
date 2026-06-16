<!--
  内链植入结果展示与人工编辑。

  边界：
  - 不负责：自动匹配算法（后端 linking 模块）
-->
<template>
  <div>
    <el-alert
      v-if="!applied"
      type="info"
      :closable="false"
      show-icon
      title="尚未完成内链植入"
      description="工作流在 Semrush 终检前会自动植入站内链接；若状态为「内链处理」请稍候刷新。"
    />

    <template v-else>
      <el-descriptions :column="2" border class="mb-4">
        <el-descriptions-item label="植入状态">
          <el-tag type="success">已完成</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="内链数量">
          {{ editing ? editLinks.length : links.length }}
        </el-descriptions-item>
      </el-descriptions>

      <div class="mb-4 flex flex-wrap gap-2">
        <template v-if="editable">
          <el-button v-if="!editing" @click="startEdit">编辑内链</el-button>
          <template v-else>
            <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
            <el-button @click="cancelEdit">取消</el-button>
            <el-button @click="addEditRow">添加内链</el-button>
          </template>
          <el-button :loading="reapplying" @click="handleReapply">重跑自动内链</el-button>
        </template>
      </div>

      <el-table v-if="(editing ? editLinks : links).length" :data="editing ? editLinks : links" stripe>
        <el-table-column label="锚文本" min-width="140">
          <template #default="{ row, $index }">
            <el-input
              v-if="editing"
              v-model="editLinks[$index].anchorText"
              maxlength="200"
            />
            <span v-else>{{ row.anchorText }}</span>
          </template>
        </el-table-column>
        <el-table-column label="目标 URL" min-width="240">
          <template #default="{ row, $index }">
            <el-input v-if="editing" v-model="editLinks[$index].targetUrl" maxlength="2000" />
            <el-link v-else :href="row.targetUrl" target="_blank" type="primary">
              {{ row.targetUrl }}
            </el-link>
          </template>
        </el-table-column>
        <el-table-column v-if="!editing" prop="pageType" label="页面类型" width="110">
          <template #default="{ row }">
            <el-tag size="small" :type="dictTagType(sitePageTypeDict, row.pageType)">
              {{ dictLabel(sitePageTypeDict, row.pageType) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column v-if="!editing" prop="confidence" label="置信度" width="90">
          <template #default="{ row }">
            {{ formatConfidence(row.confidence) }}
          </template>
        </el-table-column>
        <el-table-column v-if="!editing" prop="insertAfterHeading" label="插入章节" min-width="140">
          <template #default="{ row }">
            {{ row.insertAfterHeading || "正文" }}
          </template>
        </el-table-column>
        <el-table-column v-if="!editing" prop="matchReason" label="匹配原因" min-width="200" show-overflow-tooltip />
        <el-table-column v-if="editing" label="操作" width="90" fixed="right">
          <template #default="{ $index }">
            <el-button link type="danger" @click="removeEditRow($index)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty
        v-else-if="!editing"
        description="页面库为空或未找到合适匹配，正文未插入内链"
      />
      <div v-else class="rounded border border-dashed border-gray-200 p-6 text-center text-gray-500">
        暂无内链，点击「添加内链」手动插入
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { ArticleJobInternalLink } from "@/api/seo-factory/types";
import {
  patchArticleInternalLinks,
  reapplyArticleInternalLinks
} from "@/api/seo-factory/article-job";
import { sitePageTypeDict } from "@/constants/dicts/seo-factory";
import { dictLabel, dictTagType } from "@/utils/dict";
import { message } from "@/utils/message";

defineOptions({ name: "ArticleJobInternalLinksPanel" });

const props = defineProps<{
  projectId?: string;
  jobId?: string;
  internalLinks?: ArticleJobInternalLink[] | null;
  internalLinksApplied?: boolean;
}>();

const emit = defineEmits<{
  updated: [];
}>();

const applied = computed(() => props.internalLinksApplied === true);
const links = computed(() => props.internalLinks ?? []);
const editable = computed(() => Boolean(props.projectId && props.jobId && applied.value));

const editing = ref(false);
const saving = ref(false);
const reapplying = ref(false);
const editLinks = ref<Array<{ anchorText: string; targetUrl: string }>>([]);

watch(
  () => props.internalLinks,
  (value) => {
    if (!editing.value) {
      editLinks.value = (value ?? []).map((link) => ({
        anchorText: link.anchorText,
        targetUrl: link.targetUrl
      }));
    }
  },
  { immediate: true, deep: true }
);

function formatConfidence(value: number) {
  if (typeof value !== "number") return "-";
  return `${Math.round(value * 100)}%`;
}

function startEdit() {
  editLinks.value = links.value.map((link) => ({
    anchorText: link.anchorText,
    targetUrl: link.targetUrl
  }));
  editing.value = true;
}

function cancelEdit() {
  editing.value = false;
  editLinks.value = links.value.map((link) => ({
    anchorText: link.anchorText,
    targetUrl: link.targetUrl
  }));
}

function addEditRow() {
  editLinks.value.push({ anchorText: "", targetUrl: "" });
}

function removeEditRow(index: number) {
  editLinks.value.splice(index, 1);
}

async function handleSave() {
  if (!props.projectId || !props.jobId) return;

  saving.value = true;
  try {
    await patchArticleInternalLinks(props.projectId, props.jobId, {
      internalLinks: editLinks.value
        .filter((link) => link.anchorText.trim() && link.targetUrl.trim())
        .map((link) => ({
          anchorText: link.anchorText.trim(),
          targetUrl: link.targetUrl.trim()
        }))
    });
    message("内链已保存并同步到正文", { type: "success" });
    editing.value = false;
    emit("updated");
  } catch (error) {
    message(error instanceof Error ? error.message : "保存失败", { type: "error" });
  } finally {
    saving.value = false;
  }
}

async function handleReapply() {
  if (!props.projectId || !props.jobId) return;

  reapplying.value = true;
  try {
    await reapplyArticleInternalLinks(props.projectId, props.jobId);
    message("正在重新植入内链…", { type: "success" });
    editing.value = false;
    emit("updated");
  } catch (error) {
    message(error instanceof Error ? error.message : "重跑失败", { type: "error" });
  } finally {
    reapplying.value = false;
  }
}
</script>
