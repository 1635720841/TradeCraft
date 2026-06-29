<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useNav } from "@/layout/hooks/useNav";
import { isProjectWorkbenchPath } from "@/layout/utils/route-shell";
import LayNavMix from "../lay-sidebar/NavMix.vue";
import LaySidebarTopCollapse from "../lay-sidebar/components/SidebarTopCollapse.vue";
import LayTopBarLogo from "../lay-topbar/LayTopBarLogo.vue";
import LayTopBarTitle from "../lay-topbar/LayTopBarTitle.vue";
import LayTopBarRight from "../lay-topbar/LayTopBarRight.vue";

const route = useRoute();
const { layout, device, pureApp, toggleSideBar } = useNav();
const hidePlatformSidebar = computed(() => isProjectWorkbenchPath(route.path));
</script>

<template>
  <div
    class="navbar shell-navbar"
    :class="{ 'merwise-topbar': layout !== 'mix' }"
  >
    <LaySidebarTopCollapse
      v-if="device === 'mobile'"
      class="hamburger-container"
      :is-active="pureApp.sidebar.opened"
      @toggleClick="toggleSideBar"
    />

    <template v-if="layout === 'mix'">
      <LayNavMix />
    </template>

    <template v-else-if="device !== 'mobile'">
      <LayTopBarLogo v-if="hidePlatformSidebar" />
      <LayTopBarTitle />
      <LayTopBarRight />
    </template>
  </div>
</template>

<style lang="scss" scoped>
.navbar {
  width: 100%;
  overflow: hidden;

  .hamburger-container {
    flex-shrink: 0;
    height: var(--shell-header-height);
    line-height: var(--shell-header-height);
    cursor: pointer;
  }
}
</style>
