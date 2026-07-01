<!--
  工作台内容流水线条。
-->
<template>
  <section class="overview-panel">
    <header class="overview-panel__head">
      <div>
        <span class="overview-panel__kicker">内容流水线</span>
        <h2 class="overview-panel__title">内容流水线</h2>
        <p class="overview-panel__desc">
          从大纲确认、生成、审核到发布，把当前产能和阻塞点一眼看清。
        </p>
      </div>
    </header>
    <div class="overview-panel__body">
      <div class="pipeline-strip">
        <button
          v-for="step in steps"
          :key="step.id"
          type="button"
          class="pipeline-step"
          :class="{ 'pipeline-step--active': step.count > 0 }"
          tabindex="0"
          @click="step.action"
          @keydown.enter.prevent="step.action()"
          @keydown.space.prevent="step.action()"
        >
          <span class="pipeline-step__count">{{ step.count }}</span>
          <span class="pipeline-step__label">{{ step.label }}</span>
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
export interface WorkbenchPipelineStep {
  id: string;
  label: string;
  count: number;
  action: () => void;
}

defineProps<{
  steps: WorkbenchPipelineStep[];
}>();
</script>
