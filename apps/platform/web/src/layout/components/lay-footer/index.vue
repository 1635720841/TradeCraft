<script setup lang="ts">
import { getConfig } from "@/config";

const TITLE = getConfig("Title");
</script>

<template>
  <footer class="layout-footer">
    Copyright © 2020-present
    <a href="https://github.com/pure-admin" target="_blank">
      &nbsp;{{ TITLE }}
    </a>
  </footer>
</template>

<style lang="scss" scoped>
.layout-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
}
</style>
