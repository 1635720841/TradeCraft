<!--
  转化追踪表说明。

  边界：
  - 不负责：CSV 下载（SiteConversionTrackingExportDialog）
-->
<template>
  <div class="space-y-2 text-sm text-gray-600">
    <p>在 Google Analytics、百度统计里查看哪篇文章带来了咨询。</p>
    <ol class="list-decimal space-y-1 pl-5">
      <li>先填好「引导链接」和下方追踪参数。</li>
      <li>核对文末按钮使用的是表格里的转化链接。</li>
      <li>在统计工具里按关键词查看效果。</li>
    </ol>
    <p class="text-xs text-gray-500">未填引导链接时，转化链接为空。</p>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: "SiteConversionTrackingHelpPanel" });
</script>
