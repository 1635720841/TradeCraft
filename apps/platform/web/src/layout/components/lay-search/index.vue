<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";
import { Search } from "@lucide/vue";
import { useBoolean } from "../../hooks/useBoolean";
import SearchModal from "./components/SearchModal.vue";

const { bool: show, setTrue, toggle } = useBoolean();

function handleSearch() {
  setTrue();
}

function onKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    setTrue();
  }
}

onMounted(() => {
  window.addEventListener("keydown", onKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
});
</script>

<template>
  <div>
    <button type="button" class="shell-topbar-search" @click="handleSearch">
      <Search :size="16" :stroke-width="1.75" aria-hidden="true" />
      <span>搜索项目、功能、数据...</span>
      <kbd class="shell-topbar-search__key">⌘K</kbd>
    </button>
    <SearchModal v-model:value="show" />
  </div>
</template>
