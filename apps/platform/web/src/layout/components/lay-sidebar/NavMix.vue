<script setup lang="ts">
import { isAllEmpty } from "@pureadmin/utils";
import { useNav } from "@/layout/hooks/useNav";
import { transformI18n } from "@/plugins/i18n";
import { isProjectWorkbenchPath } from "@/layout/utils/route-shell";
import LayTopBarLogo from "../lay-topbar/LayTopBarLogo.vue";
import LayTopBarTitle from "../lay-topbar/LayTopBarTitle.vue";
import LayTopBarRight from "../lay-topbar/LayTopBarRight.vue";
import { computed, ref, toRaw, watch, onMounted, nextTick } from "vue";
import { useRenderIcon } from "@/components/ReIcon/src/hooks";
import { getParentPaths, findRouteByPath } from "@/router/utils";
import { useTranslationLang } from "../../hooks/useTranslationLang";
import { usePermissionStoreHook } from "@/store/modules/permission";
import LaySidebarExtraIcon from "../lay-sidebar/components/SidebarExtraIcon.vue";

const menuRef = ref();
const defaultActive = ref(null);

const { route } = useTranslationLang(menuRef);
const { device, resolvePath, getDivStyle } = useNav();
const hidePlatformSidebar = computed(() => isProjectWorkbenchPath(route.path));

function getDefaultActive(routePath) {
  const wholeMenus = usePermissionStoreHook().wholeMenus;
  /** 当前路由的父级路径 */
  const parentRoutes = getParentPaths(routePath, wholeMenus)[0];
  defaultActive.value = !isAllEmpty(route.meta?.activePath)
    ? route.meta.activePath
    : findRouteByPath(parentRoutes, wholeMenus)?.children[0]?.path;
}

onMounted(() => {
  getDefaultActive(route.path);
});

nextTick(() => {
  menuRef.value?.handleResize();
});

watch(
  () => [route.path, usePermissionStoreHook().wholeMenus],
  () => {
    getDefaultActive(route.path);
  }
);
</script>

<template>
  <div
    v-if="device !== 'mobile'"
    v-loading="usePermissionStoreHook().wholeMenus.length === 0"
    class="horizontal-header shell-header merwise-topbar merwise-topbar--mix"
  >
    <LayTopBarLogo v-if="hidePlatformSidebar" />
    <LayTopBarTitle class="merwise-topbar__title" />
    <el-menu
      ref="menuRef"
      router
      mode="horizontal"
      popper-class="pure-scrollbar"
      class="horizontal-header-menu merwise-topbar__menu"
      :default-active="defaultActive"
    >
      <el-menu-item
        v-for="menuRoute in usePermissionStoreHook().wholeMenus"
        :key="menuRoute.path"
        :index="resolvePath(menuRoute) || menuRoute.redirect"
      >
        <template #title>
          <div
            v-if="toRaw(menuRoute.meta.icon)"
            :class="['sub-menu-icon', menuRoute.meta.icon]"
          >
            <component
              :is="
                useRenderIcon(menuRoute.meta && toRaw(menuRoute.meta.icon))
              "
            />
          </div>
          <div :style="getDivStyle">
            <span class="select-none">
              {{ transformI18n(menuRoute.meta.title) }}
            </span>
            <LaySidebarExtraIcon :extraIcon="menuRoute.meta.extraIcon" />
          </div>
        </template>
      </el-menu-item>
    </el-menu>
    <LayTopBarRight />
  </div>
</template>

<style lang="scss" scoped>
:deep(.el-loading-mask) {
  opacity: 0.45;
}

.merwise-topbar--mix {
  .merwise-topbar__title {
    margin-right: 0;
  }

  .merwise-topbar__menu {
    flex: 1;
    min-width: 0;
    margin-left: 8px;
  }
}
</style>
