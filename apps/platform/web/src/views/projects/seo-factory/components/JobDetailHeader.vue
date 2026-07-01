<!--
  文章任务详情页头：标题、状态标签与主要操作按钮。

  边界：
  - 不负责：任务数据拉取与轮询（JobDetailView）
-->
<template>
  <header class="job-detail-top">
    <div class="job-detail-top__head">
      <div class="job-detail-top__main">
        <el-button
          link
          type="primary"
          class="job-detail-top__back"
          title="返回任务列表"
          @click="emit('back')"
        >
          <IconifyIconOnline icon="ri:arrow-left-line" />
        </el-button>
        <div class="job-detail-top__title-wrap">
          <div class="job-detail-top__title-row">
            <h1>{{ job.targetKeyword }}</h1>
            <el-tag :type="dictTagType(jobStatusDict, displayStatus)" size="small">
              {{ dictLabel(jobStatusDict, displayStatus) }}
            </el-tag>
            <el-tag
              v-if="job.searchIntent"
              size="small"
              :type="dictTagType(keywordIntentDict, job.searchIntent)"
            >
              {{ dictLabel(keywordIntentDict, job.searchIntent) }}
            </el-tag>
            <el-tag v-if="polling" type="info" size="small">刷新中</el-tag>
          </div>
          <div class="job-detail-top__meta">
            {{ formatTime(job.createdAt) }}
            <span v-if="job.updatedAt"> · 更新 {{ formatTime(job.updatedAt) }}</span>
          </div>
        </div>
      </div>
      <div class="job-detail-top__actions">
        <el-button
          v-if="canPause && canWriteJob"
          type="warning"
          size="small"
          plain
          :loading="pausing"
          @click="emit('pause')"
        >
          暂停任务
        </el-button>
        <el-button
          v-if="canResume && canWriteJob"
          type="primary"
          size="small"
          :loading="resuming"
          @click="emit('resume')"
        >
          继续执行
        </el-button>
        <el-button
          v-if="canRetry && canWriteJob"
          type="primary"
          size="small"
          :loading="retrying"
          @click="emit('retry')"
        >
          重新生成
        </el-button>
        <el-button
          v-if="job.outputUrl && !exportStale"
          type="success"
          size="small"
          :loading="exportDownloading === 'html'"
          @click="emit('download-export', 'html')"
        >
          下载 HTML
        </el-button>
        <el-button
          v-if="cmsUiEnabled && canPublishToCms && canPublishJob"
          type="success"
          size="small"
          plain
          :loading="cmsPublishing"
          @click="emit('publish-cms')"
        >
          {{ cmsPublishButtonLabel }}
        </el-button>
        <el-button
          v-if="canWriteJob"
          type="danger"
          size="small"
          plain
          :loading="deleting"
          @click="emit('delete-job')"
        >
          删除
        </el-button>
      </div>
    </div>

    <ArticleJobOutcomeSummaryCard
      :job="job"
      @go-diagnose="emit('go-diagnose')"
      @go-section="emit('go-section', $event)"
      @print-report="emit('print-report')"
    />
  </header>
</template>

<script setup lang="ts">
import type { ArticleJobItem } from "@/api/seo-factory/types";
import {
  jobStatusDict,
  keywordIntentDict
} from "@/constants/dicts/seo-factory";
import { dictLabel, dictTagType } from "@/utils/dict";
import { resolveJobDisplayStatus } from "@/utils/seo-factory/job-list-status";
import type { DiagnoseSection } from "@/utils/seo-factory/job-detail-summary";
import ArticleJobOutcomeSummaryCard from "./ArticleJobOutcomeSummaryCard.vue";
import { computed } from "vue";

defineOptions({ name: "JobDetailHeader" });

const props = defineProps<{
  job: ArticleJobItem;
  polling: boolean;
  canRetry: boolean;
  canPause: boolean;
  canResume: boolean;
  canWriteJob: boolean;
  pausing: boolean;
  resuming: boolean;
  retrying: boolean;
  exportStale: boolean;
  exportDownloading: "html" | "jsonld" | "package" | null;
  cmsUiEnabled: boolean;
  canPublishToCms: boolean;
  canPublishJob: boolean;
  cmsPublishing: boolean;
  cmsPublishButtonLabel: string;
  deleting: boolean;
}>();

const displayStatus = computed(() => resolveJobDisplayStatus(props.job));

const emit = defineEmits<{
  (e: "back"): void;
  (e: "pause"): void;
  (e: "resume"): void;
  (e: "retry"): void;
  (e: "download-export", format: "html"): void;
  (e: "publish-cms"): void;
  (e: "delete-job"): void;
  (e: "go-diagnose"): void;
  (e: "go-section", section: DiagnoseSection): void;
  (e: "print-report"): void;
}>();

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("zh-CN");
}
</script>
