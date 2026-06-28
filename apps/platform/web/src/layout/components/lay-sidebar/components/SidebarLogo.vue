<script setup lang="ts">
import { getTopMenu } from "@/router/utils";
import { useNav } from "@/layout/hooks/useNav";

defineProps({
  collapse: Boolean
});

const { title, getLogo } = useNav();
</script>

<template>
  <div class="sidebar-logo-container" :class="{ collapses: collapse }">
    <transition name="sidebarLogoFade">
      <router-link
        v-if="collapse"
        key="collapse"
        :title="title"
        class="sidebar-logo-link"
        :to="getTopMenu()?.path ?? '/'"
      >
        <img class="brand-logo" :src="getLogo()" alt="MERWISE" />
      </router-link>
      <router-link
        v-else
        key="expand"
        :title="title"
        class="sidebar-logo-link"
        :to="getTopMenu()?.path ?? '/'"
      >
        <img class="brand-logo" :src="getLogo()" alt="MERWISE" />
      </router-link>
    </transition>
  </div>
</template>

<style lang="scss" scoped>
.sidebar-logo-container {
  position: relative;
  width: 100%;
  height: 76px;
  padding: 0 10px 18px;
  overflow: hidden;

  .sidebar-logo-link {
    display: flex;
    align-items: center;
    height: 100%;

    .brand-logo {
      display: block;
      width: auto;
      max-width: 100%;
      height: 42px;
      object-fit: contain;
      object-position: left center;
      filter: drop-shadow(0 7px 12px rgb(16 86 193 / 16%));
    }
  }

  &.collapses .brand-logo {
    height: 34px;
    margin: 0 auto;
    object-position: center;
  }
}
</style>
