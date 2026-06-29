<script setup lang="ts">
import { useNav } from "@/layout/hooks/useNav";
import { getTopMenu } from "@/router/utils";

const { getLogo, title } = useNav();
</script>

<template>
  <router-link
    class="shell-topbar-logo"
    :to="getTopMenu()?.path ?? '/welcome'"
    :title="title"
  >
    <img class="shell-topbar-logo__img" :src="getLogo()" alt="MERWISE" />
  </router-link>
</template>
