<!--
  内链植入结果展示。

  边界：
  - 不负责：内链匹配算法（后端 linking 模块）
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
          {{ links.length }}
        </el-descriptions-item>
      </el-descriptions>

      <el-table v-if="links.length" :data="links" stripe>
        <el-table-column prop="anchorText" label="锚文本" min-width="140" />
        <el-table-column prop="targetUrl" label="目标 URL" min-width="240">
          <template #default="{ row }">
            <el-link :href="row.targetUrl" target="_blank" type="primary">
              {{ row.targetUrl }}
            </el-link>
          </template>
        </el-table-column>
        <el-table-column prop="pageType" label="页面类型" width="110">
          <template #default="{ row }">
            <el-tag size="small" :type="dictTagType(sitePageTypeDict, row.pageType)">
              {{ dictLabel(sitePageTypeDict, row.pageType) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="confidence" label="置信度" width="90">
          <template #default="{ row }">
            {{ formatConfidence(row.confidence) }}
          </template>
        </el-table-column>
        <el-table-column prop="insertAfterHeading" label="插入章节" min-width="140">
          <template #default="{ row }">
            {{ row.insertAfterHeading || "正文" }}
          </template>
        </el-table-column>
        <el-table-column prop="matchReason" label="匹配原因" min-width="200" show-overflow-tooltip />
      </el-table>

      <el-empty v-else description="页面库为空或未找到合适匹配，正文未插入内链" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ArticleJobInternalLink } from "@/api/seo-factory/types";
import { sitePageTypeDict } from "@/constants/dicts/seo-factory";
import { dictLabel, dictTagType } from "@/utils/dict";

defineOptions({ name: "ArticleJobInternalLinksPanel" });

const props = defineProps<{
  internalLinks?: ArticleJobInternalLink[] | null;
  internalLinksApplied?: boolean;
}>();

const applied = computed(() => props.internalLinksApplied === true);
const links = computed(() => props.internalLinks ?? []);

function formatConfidence(value: number) {
  if (typeof value !== "number") return "-";
  return `${Math.round(value * 100)}%`;
}
</script>
