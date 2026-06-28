<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { ref, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { Bell } from "@lucide/vue";
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type UserNotification
} from "@/api/org/notifications";

const { t } = useI18n();
const router = useRouter();
const noticesNum = ref(0);
const list = ref<UserNotification[]>([]);
const loading = ref(false);
let timer: ReturnType<typeof setInterval> | undefined;

async function refresh() {
  loading.value = true;
  try {
    const result = await listNotifications();
    list.value = result.items;
    noticesNum.value = result.unread;
  } catch {
    list.value = [];
    noticesNum.value = 0;
  } finally {
    loading.value = false;
  }
}

async function onClickItem(item: UserNotification) {
  if (!item.readAt) {
    await markNotificationRead(item.id).catch(() => undefined);
    item.readAt = new Date().toISOString();
    noticesNum.value = Math.max(0, noticesNum.value - 1);
  }
  if (item.linkPath) {
    await router.push(item.linkPath);
  }
}

async function onMarkAll() {
  await markAllNotificationsRead();
  list.value.forEach(i => {
    i.readAt = new Date().toISOString();
  });
  noticesNum.value = 0;
}

onMounted(() => {
  void refresh();
  timer = setInterval(() => void refresh(), 30_000);
  window.addEventListener("focus", refresh);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
  window.removeEventListener("focus", refresh);
});
</script>

<template>
  <el-dropdown trigger="click" placement="bottom-end" @visible-change="v => v && refresh()">
    <button type="button" class="shell-topbar-action shell-topbar-notice">
      <el-badge
        :value="noticesNum === 0 ? '' : noticesNum"
        :max="99"
        class="shell-topbar-notice__badge"
      >
        <Bell :size="18" :stroke-width="1.75" aria-hidden="true" />
      </el-badge>
    </button>
    <template #dropdown>
      <div class="w-80 p-3">
        <div class="mb-2 flex items-center justify-between">
          <span class="text-sm font-medium">通知</span>
          <el-button v-if="noticesNum > 0" link type="primary" @click="onMarkAll">
            全部已读
          </el-button>
        </div>
        <el-scrollbar v-loading="loading" max-height="320px">
          <el-empty v-if="list.length === 0" :description="t('status.pureNoNotify')" :image-size="48" />
          <div
            v-for="item in list"
            :key="item.id"
            class="cursor-pointer border-b border-gray-100 px-1 py-2 last:border-0 hover:bg-gray-50"
            :class="{ 'opacity-60': item.readAt }"
            @click="onClickItem(item)"
          >
            <div class="text-sm font-medium">{{ item.title }}</div>
            <div v-if="item.body" class="mt-0.5 text-xs text-gray-500">{{ item.body }}</div>
          </div>
        </el-scrollbar>
      </div>
    </template>
  </el-dropdown>
</template>

<style lang="scss" scoped>
.shell-topbar-notice {
  width: 40px;
  padding: 0;
  justify-content: center;
}

.shell-topbar-notice__badge {
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
