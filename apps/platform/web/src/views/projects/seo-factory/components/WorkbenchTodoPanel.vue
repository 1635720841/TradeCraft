<!--
  工作台今日待办面板。
-->
<template>
  <section v-loading="loading" class="overview-panel">
    <header class="overview-panel__head">
      <div>
        <span class="overview-panel__kicker">优先处理</span>
        <h2 class="overview-panel__title">今日待办</h2>
        <p class="overview-panel__desc">
          把会阻塞发文、审核和搜索表现的数据放在这里，运营先处理这些。
        </p>
      </div>
      <el-tag size="small" :type="items.length ? 'warning' : 'success'">
        {{ items.length ? `${items.length} 项待处理` : "产线健康" }}
      </el-tag>
    </header>
    <div class="overview-panel__body">
      <el-empty
        v-if="items.length === 0"
        description="暂无紧急待办，可新建任务或查看列表"
        :image-size="72"
      />
      <div v-else class="todo-list">
        <div v-for="item in items" :key="item.id" class="todo-item">
          <div class="todo-item__text">
            <el-tag :type="item.tagType" size="small">{{ item.tagLabel }}</el-tag>
            <span>{{ item.text }}</span>
          </div>
          <div class="todo-item__actions">
            <el-button
              v-if="item.secondaryAction"
              size="small"
              @click="item.secondaryAction"
            >
              {{ item.secondaryActionLabel }}
            </el-button>
            <el-button
              size="small"
              :type="item.buttonType"
              :loading="item.loading"
              @click="item.action"
            >
              {{ item.actionLabel }}
            </el-button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
export interface WorkbenchTodoItem {
  id: string;
  tagLabel: string;
  tagType: "danger" | "warning" | "info";
  text: string;
  actionLabel: string;
  buttonType: "primary" | "warning" | "danger" | "default";
  action: () => void;
  secondaryActionLabel?: string;
  secondaryAction?: () => void;
  loading?: boolean;
}

defineProps<{
  loading?: boolean;
  items: WorkbenchTodoItem[];
}>();
</script>
