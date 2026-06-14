<!--
  编辑 vs AI 重写：帮助用户选择合适工具。

  边界：
  - 不负责：触发重写/编辑
 -->
<template>
  <el-collapse class="mb-4">
    <el-collapse-item title="什么时候用手动编辑 / AI 重写？" name="guide">
      <el-table :data="rows" size="small" border>
        <el-table-column prop="scenario" label="你想…" min-width="160" />
        <el-table-column prop="tool" label="推荐" width="120" />
        <el-table-column prop="note" label="说明" min-width="200" />
      </el-table>
    </el-collapse-item>
  </el-collapse>
</template>

<script setup lang="ts">
defineOptions({ name: "ArticleJobDraftEditGuide" });

const rows = [
  { scenario: "改一个词、价格、年份、产品名", tool: "手动编辑", note: "即时保存，不动整体结构" },
  { scenario: "按 SEO 建议改语气、可读性", tool: "AI 重写", note: "约 30–90 秒，可预览候选版" },
  { scenario: "整篇结构不对", tool: "续跑任务", note: "从失败/优化步骤继续，或重新入队" }
];
</script>
