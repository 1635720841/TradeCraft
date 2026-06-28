<script setup lang="ts">
import { useNav } from "@/layout/hooks/useNav";
import LayNavMix from "../lay-sidebar/NavMix.vue";
import LaySidebarTopCollapse from "../lay-sidebar/components/SidebarTopCollapse.vue";
import LayTopBarTitle from "../lay-topbar/LayTopBarTitle.vue";
import LayTopBarRight from "../lay-topbar/LayTopBarRight.vue";

const { layout, device, pureApp, toggleSideBar } = useNav();
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
