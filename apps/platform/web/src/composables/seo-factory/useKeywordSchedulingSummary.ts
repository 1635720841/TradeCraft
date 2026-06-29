import { onMounted, ref } from "vue";
import { getKeywordSummary, type KeywordSummary } from "@/api/seo-factory/keyword";

export function useKeywordSchedulingSummary(projectId: string) {
  const summary = ref<KeywordSummary | null>(null);
  const loading = ref(false);

  async function refreshSummary() {
    loading.value = true;
    try {
      summary.value = await getKeywordSummary(projectId);
    } finally {
      loading.value = false;
    }
  }

  onMounted(() => {
    void refreshSummary();
  });

  return { summary, loading, refreshSummary };
}
