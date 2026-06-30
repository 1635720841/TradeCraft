<!--
  文章任务详情侧栏：生成进度、导出发布、检查清单与高级信息。
-->
<template>
  <aside class="job-detail-sidebar">
    <div class="job-detail-panel job-detail-progress">
      <div class="job-detail-panel__head">生成进度</div>
      <div class="job-detail-panel__body">
        <ArticleJobGenerationTimeline
          :job="job"
          :activity-items="activityItems"
          :collapsible="job.status === 'COMPLETED'"
        />
      </div>
    </div>

    <div class="job-detail-panel">
      <div class="job-detail-panel__head">导出与发布</div>
      <div class="job-detail-panel__body">
        <div v-if="exportStale" class="mb-3 text-sm text-amber-600">
          稿件已编辑，导出物已失效。
          <el-button type="primary" link @click="emit('resolve-draft-stale')">
            重新生成
          </el-button>
        </div>
        <div v-else-if="job.outputUrl" class="job-detail-export-actions">
          <div class="job-detail-export-actions__downloads">
            <el-button
              :loading="exportDownloading === 'package'"
              @click="emit('download-export', 'package')"
            >
              <IconifyIconOnline icon="ri:folder-zip-line" />
              资产包
            </el-button>
            <el-button
              :loading="exportDownloading === 'html'"
              @click="emit('download-export', 'html')"
            >
              <IconifyIconOnline icon="ri:file-code-line" />
              HTML
            </el-button>
            <el-button
              :loading="exportDownloading === 'jsonld'"
              @click="emit('download-export', 'jsonld')"
            >
              <IconifyIconOnline icon="ri:braces-line" />
              JSON-LD
            </el-button>
          </div>
          <el-button
            v-if="cmsUiEnabled && canPublishToCms"
            type="success"
            :loading="cmsPublishing"
            @click="emit('publish-cms')"
          >
            <IconifyIconOnline icon="ri:send-plane-line" class="mr-1" />
            {{ cmsPublishButtonLabel }}
          </el-button>
          <el-link
            v-if="cmsUiEnabled && cmsPublishResult?.postUrl"
            :href="cmsPublishResult.postUrl"
            target="_blank"
            type="primary"
            class="job-detail-export-actions__link"
          >
            查看 CMS 文章 →
          </el-link>
        </div>
        <span v-else-if="requiresHumanReview" class="text-sm text-amber-600">
          YMYL 需人工审核，未生成可发布 HTML
        </span>
        <span v-else class="text-sm text-gray-500">任务完成后可导出</span>
      </div>
    </div>

    <ArticleJobDraftPublishChecklist
      v-if="prePublishChecklistItems.length && activeTab !== 'article'"
      variant="pre-publish"
      :items="prePublishChecklistItems"
      @action="emit('pre-publish-action', $event)"
      @go-ymyl="emit('go-tab', 'diagnose', 'ymyl')"
      @go-seo="emit('go-tab', 'diagnose', 'seo')"
      @go-edit="emit('go-tab', 'article')"
      @go-tab="emit('checklist-go-tab', $event)"
      @go-sites="emit('go-sites')"
    />

    <ArticleJobDraftPublishChecklist
      v-if="publishChecklistItems.length && activeTab !== 'article'"
      :items="publishChecklistItems"
      @action="emit('checklist-action', $event)"
      @go-ymyl="emit('go-tab', 'diagnose', 'ymyl')"
      @go-edit="emit('go-tab', 'article')"
    />

    <div class="job-detail-panel">
      <el-collapse>
        <el-collapse-item title="活动" name="activity">
          <ArticleJobActivityTimeline
            :project-id="projectId"
            :job-id="job.id"
          />
        </el-collapse-item>
        <el-collapse-item title="协作" name="collab">
          <ArticleJobCollabPanel
            :project-id="projectId"
            :job-id="job.id"
            :can-write="canWriteJob"
          />
        </el-collapse-item>
        <el-collapse-item title="高级信息" name="advanced">
          <ul class="job-detail-meta-list">
            <li class="job-detail-meta-list__item">
              <span class="job-detail-meta-list__label">任务 ID</span>
              <span class="job-detail-meta-list__value text-xs">{{ job.id }}</span>
            </li>
            <li class="job-detail-meta-list__item">
              <span class="job-detail-meta-list__label">Trace</span>
              <span class="job-detail-meta-list__value text-xs">{{ job.traceId }}</span>
            </li>
            <li v-if="job.serpData?.fingerprint" class="job-detail-meta-list__item">
              <span class="job-detail-meta-list__label">搜索指纹</span>
              <span class="job-detail-meta-list__value text-xs">
                {{ job.serpData.fingerprint }}
              </span>
            </li>
          </ul>
        </el-collapse-item>
      </el-collapse>
    </div>
  </aside>
</template>

<script setup lang="ts">
import type { JobActivityItem } from "@/api/seo-factory/article-job-activity";
import type { ArticleJobItem } from "@/api/seo-factory/types";
import type {
  PublishChecklistAction,
  PublishChecklistItem
} from "@/utils/seo-factory/draft-edit-preview";
import ArticleJobActivityTimeline from "./ArticleJobActivityTimeline.vue";
import ArticleJobCollabPanel from "./ArticleJobCollabPanel.vue";
import ArticleJobDraftPublishChecklist from "./ArticleJobDraftPublishChecklist.vue";
import ArticleJobGenerationTimeline from "./ArticleJobGenerationTimeline.vue";

defineOptions({ name: "ArticleJobDetailSidebar" });

defineProps<{
  job: ArticleJobItem;
  activityItems: JobActivityItem[];
  projectId: string;
  canWriteJob: boolean;
  cmsUiEnabled: boolean;
  exportStale: boolean;
  exportDownloading: string | null;
  cmsPublishing: boolean;
  canPublishToCms: boolean;
  cmsPublishButtonLabel: string;
  cmsPublishResult: { postUrl?: string | null } | null;
  requiresHumanReview: boolean;
  prePublishChecklistItems: PublishChecklistItem[];
  publishChecklistItems: PublishChecklistItem[];
  activeTab: "article" | "diagnose" | "brief";
}>();

const emit = defineEmits<{
  "resolve-draft-stale": [];
  "download-export": [type: "package" | "html" | "jsonld"];
  "publish-cms": [];
  "pre-publish-action": [action: PublishChecklistAction];
  "checklist-action": [action: PublishChecklistAction];
  "go-tab": [tab: "article" | "diagnose" | "brief", section?: string];
  "checklist-go-tab": [tab: string];
  "go-sites": [];
}>();
</script>
