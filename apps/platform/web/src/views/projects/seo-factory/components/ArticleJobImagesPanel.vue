<!--
  配图植入结果展示。

  边界：
  - 不负责：Flux 生成（后端 illustration 模块）
-->
<template>
  <div>
    <el-alert
      v-if="!applied"
      type="info"
      :closable="false"
      show-icon
      title="尚未完成配图植入"
      description="工作流在 Semrush 终检前会自动补足 SWA 所需图片；若状态为「配图处理」请稍候刷新。"
    />

    <template v-else>
      <el-descriptions :column="2" border class="mb-4">
        <el-descriptions-item label="植入状态">
          <el-tag type="success">已完成</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="图片数量">
          {{ images.length }}
        </el-descriptions-item>
      </el-descriptions>

      <el-table v-if="images.length" :data="images" stripe>
        <el-table-column prop="alt" label="Alt 文本" min-width="220" show-overflow-tooltip />
        <el-table-column prop="url" label="图片 URL" min-width="240">
          <template #default="{ row }">
            <el-link :href="row.url" target="_blank" type="primary">
              {{ row.url }}
            </el-link>
          </template>
        </el-table-column>
        <el-table-column prop="source" label="来源" width="110">
          <template #default>
            <el-tag size="small" type="success">BFL 官方</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="insertAfterHeading" label="插入章节" min-width="140">
          <template #default="{ row }">
            {{ row.insertAfterHeading || "正文" }}
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-else description="BFL 未生成图片或生成失败" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ArticleJobArticleImage } from "@/api/seo-factory/types";

defineOptions({ name: "ArticleJobImagesPanel" });

const props = defineProps<{
  articleImages?: ArticleJobArticleImage[] | null;
  imagesApplied?: boolean;
}>();

const applied = computed(() => props.imagesApplied === true);
const images = computed(() => props.articleImages ?? []);
</script>
