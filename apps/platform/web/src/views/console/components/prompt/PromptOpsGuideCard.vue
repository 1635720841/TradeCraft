<!--
  Prompt 运营说明（默认折叠，管理端减噪）。
-->
<template>
  <el-collapse class="mb-0">
    <el-collapse-item title="Prompt 运营指南（点击展开）" name="guide">
      <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <ul class="space-y-1 text-sm mw-text-body">
          <li>
            <strong>日常调文案：</strong>在「当前线上配置」找到对应功能 → 点「编辑 Prompt」→ 保存即生效。
          </li>
          <li>
            <strong>换 Prompt 版本（A/B）：</strong>在下方卡片选版本 → 点「应用」→ 新任务立即使用新版本。
          </li>
          <li>
            <strong>新建版本：</strong>在底部「全部版本」点新建，保存后再回到上方绑定到对应功能。
          </li>
        </ul>
        <div class="shrink-0 rounded-lg border border-dashed mw-border-card px-4 py-3 text-sm">
          <div class="font-medium mw-text-body">文章生产链路</div>
          <div class="mt-2 flex flex-wrap items-center gap-1 mw-text-muted">
            <el-tag size="small" effect="plain">分析搜索结果</el-tag>
            <span>→</span>
            <el-tag size="small" type="primary" effect="plain">大纲</el-tag>
            <span>→</span>
            <el-tag size="small" type="primary" effect="plain">初稿</el-tag>
            <span>→</span>
            <el-tag size="small" effect="plain">内链/配图</el-tag>
            <span>→</span>
            <el-tag size="small" type="warning" effect="plain">优化</el-tag>
            <span>→</span>
            <el-tag size="small" effect="plain">导出</el-tag>
          </div>
          <div class="mt-2 text-xs mw-text-muted">蓝色标签 = 本页可编辑的 Prompt 环节</div>
        </div>
      </div>
    </el-collapse-item>
  </el-collapse>
</template>

<script setup lang="ts">
defineOptions({ name: "PromptOpsGuideCard" });
</script>
