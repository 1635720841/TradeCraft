<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { ref, computed } from "vue";
import { Bell } from "@lucide/vue";
import { noticesData } from "./data";
import NoticeList from "./components/NoticeList.vue";

const { t } = useI18n();
const noticesNum = ref(0);
const notices = ref(noticesData);
const activeKey = ref(noticesData[0]?.key);

notices.value.map(v => (noticesNum.value += v.list.length));

const getLabel = computed(
  () => item =>
    t(item.name) + (item.list.length > 0 ? `(${item.list.length})` : "")
);
</script>

<template>
  <el-dropdown trigger="click" placement="bottom-end">
    <button type="button" class="shell-topbar-action shell-topbar-notice">
      <el-badge
        :value="Number(noticesNum) === 0 ? '' : noticesNum"
        :max="99"
        class="shell-topbar-notice__badge"
      >
        <Bell :size="18" :stroke-width="1.75" aria-hidden="true" />
      </el-badge>
    </button>
    <template #dropdown>
      <el-dropdown-menu>
        <el-tabs
          v-model="activeKey"
          :stretch="true"
          class="dropdown-tabs"
          :style="{ width: notices.length === 0 ? '200px' : '330px' }"
        >
          <el-empty
            v-if="notices.length === 0"
            :description="t('status.pureNoMessage')"
            :image-size="60"
          />
          <span v-else>
            <template v-for="item in notices" :key="item.key">
              <el-tab-pane :label="getLabel(item)" :name="`${item.key}`">
                <el-scrollbar max-height="330px">
                  <div class="noticeList-container">
                    <NoticeList :list="item.list" :emptyText="item.emptyText" />
                  </div>
                </el-scrollbar>
              </el-tab-pane>
            </template>
          </span>
        </el-tabs>
      </el-dropdown-menu>
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

.dropdown-tabs {
  .noticeList-container {
    padding: 15px 24px 0;
  }

  :deep(.el-tabs__header) {
    margin: 0;
  }

  :deep(.el-tabs__nav-wrap)::after {
    height: 1px;
  }

  :deep(.el-tabs__nav-wrap) {
    padding: 0 36px;
  }
}
</style>
