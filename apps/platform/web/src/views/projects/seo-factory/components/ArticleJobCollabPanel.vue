<!--
  任务协作：指派人 + 评论。
-->
<template>
  <div class="space-y-4">
    <div>
      <div class="mb-2 text-sm font-medium text-gray-700">负责人</div>
      <el-select
        v-model="selectedAssignee"
        filterable
        clearable
        placeholder="选择项目成员"
        class="w-full"
        :disabled="!canWrite"
        @change="onAssignChange"
      >
        <el-option
          v-for="m in members"
          :key="m.userId"
          :label="m.name || m.email"
          :value="m.userId"
        />
      </el-select>
    </div>
    <div>
      <div class="mb-2 text-sm font-medium text-gray-700">评论</div>
      <div v-if="comments.length" class="mb-2 max-h-40 space-y-2 overflow-y-auto">
        <div
          v-for="c in comments"
          :key="c.id"
          class="rounded border border-gray-100 bg-gray-50 px-2 py-1 text-sm"
        >
          <div class="text-xs text-gray-500">
            {{ c.author?.name || c.author?.email || "用户" }} ·
            {{ formatTime(c.createdAt) }}
          </div>
          <div class="mt-0.5 whitespace-pre-wrap">{{ c.body }}</div>
        </div>
      </div>
      <div class="relative">
        <el-input
          ref="commentInputRef"
          v-model="commentText"
          type="textarea"
          :rows="2"
          placeholder="添加评论…输入 @ 可提及成员"
          :disabled="!canWrite"
          @input="onCommentInput"
          @keydown="onCommentKeydown"
        />
        <div
          v-if="mentionOpen && mentionCandidates.length"
          class="absolute bottom-full left-0 z-10 mb-1 max-h-32 w-full overflow-y-auto rounded border border-gray-200 bg-white shadow"
        >
          <button
            v-for="member in mentionCandidates"
            :key="member.userId"
            type="button"
            class="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
            @mousedown.prevent="insertMention(member)"
          >
            {{ member.name || member.email }}
            <span class="text-xs text-gray-400">{{ member.email }}</span>
          </button>
        </div>
      </div>
      <el-button
        class="mt-2"
        size="small"
        type="primary"
        :disabled="!canWrite || !commentText.trim()"
        :loading="posting"
        @click="submitComment"
      >
        发送
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import type { InputInstance } from "element-plus";
import {
  addJobComment,
  assignJobUser,
  listJobAssignees,
  listJobComments,
  unassignJobUser,
  type JobComment
} from "@/api/seo-factory/article-job-collab";
import { listProjectMembers, type OrgProjectMember } from "@/api/org/projects";
import { message } from "@/utils/message";

const props = defineProps<{
  projectId: string;
  jobId: string;
  canWrite: boolean;
}>();

const members = ref<OrgProjectMember[]>([]);
const comments = ref<JobComment[]>([]);
const selectedAssignee = ref("");
const commentText = ref("");
const posting = ref(false);
const mentionOpen = ref(false);
const mentionQuery = ref("");
const commentInputRef = ref<InputInstance>();

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("zh-CN");
}

const mentionCandidates = computed(() => {
  const q = mentionQuery.value.trim().toLowerCase();
  if (!q) return members.value.slice(0, 8);
  return members.value
    .filter((member) => {
      const email = member.email.toLowerCase();
      const name = (member.name ?? "").toLowerCase();
      return email.includes(q) || name.includes(q);
    })
    .slice(0, 8);
});

function updateMentionState() {
  const text = commentText.value;
  const cursor = text.length;
  const beforeCursor = text.slice(0, cursor);
  const atIndex = beforeCursor.lastIndexOf("@");
  if (atIndex < 0) {
    mentionOpen.value = false;
    mentionQuery.value = "";
    return;
  }
  const fragment = beforeCursor.slice(atIndex + 1);
  if (/\s/.test(fragment)) {
    mentionOpen.value = false;
    mentionQuery.value = "";
    return;
  }
  mentionOpen.value = true;
  mentionQuery.value = fragment;
}

function onCommentInput() {
  updateMentionState();
}

function onCommentKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    mentionOpen.value = false;
  }
}

function insertMention(member: OrgProjectMember) {
  const text = commentText.value;
  const atIndex = text.lastIndexOf("@");
  if (atIndex < 0) return;
  commentText.value = `${text.slice(0, atIndex)}@${member.email} `;
  mentionOpen.value = false;
  mentionQuery.value = "";
  commentInputRef.value?.focus();
}

async function refresh() {
  const [c, a] = await Promise.all([
    listJobComments(props.projectId, props.jobId),
    listJobAssignees(props.projectId, props.jobId)
  ]);
  comments.value = c;
  selectedAssignee.value = a[0]?.userId ?? "";
}

async function loadMembers() {
  members.value = await listProjectMembers(props.projectId);
}

async function onAssignChange(userId: string | undefined) {
  if (!userId) {
    const current = (await listJobAssignees(props.projectId, props.jobId))[0];
    if (current) await unassignJobUser(props.projectId, props.jobId, current.userId);
    return;
  }
  await assignJobUser(props.projectId, props.jobId, userId);
  message("已更新负责人", { type: "success" });
}

async function submitComment() {
  const body = commentText.value.trim();
  if (!body) return;
  posting.value = true;
  try {
    await addJobComment(props.projectId, props.jobId, body);
    commentText.value = "";
    mentionOpen.value = false;
    comments.value = await listJobComments(props.projectId, props.jobId);
  } finally {
    posting.value = false;
  }
}

watch(
  () => [props.projectId, props.jobId],
  () => void refresh(),
  { immediate: true }
);

onMounted(() => void loadMembers());
</script>
