/**
 * 关键词池：AI 种子词对话框状态与 API。
 */
import { nextTick, reactive, ref, type Ref } from "vue";
import {
  confirmKeywordSeeds,
  previewKeywordSeeds,
  type KeywordSeedCandidate
} from "@/api/seo-factory/keyword";
import { listSites } from "@/api/seo-factory/site";
import type { SiteItem } from "@/api/seo-factory/types";
import { buildGscSeedTopicHint } from "@/utils/seo-factory/gsc-keyword-display";
import { message } from "@/utils/message";
import type KeywordSeedDialog from "@/views/projects/seo-factory/components/KeywordSeedDialog.vue";

export function useKeywordSeedDialog(
  projectId: string,
  onConfirmed: () => void | Promise<void>,
  dialogUiRef?: Ref<InstanceType<typeof KeywordSeedDialog> | undefined>,
) {
  const visible = ref(false);
  const fromGsc = ref(false);
  const step = ref<"config" | "preview">("config");
  const candidates = ref<KeywordSeedCandidate[]>([]);
  const selectedCandidates = ref<KeywordSeedCandidate[]>([]);
  const previewSiteId = ref("");
  const generating = ref(false);
  const confirming = ref(false);
  const sitesLoading = ref(false);
  const sites = ref<SiteItem[]>([]);

  const form = reactive({
    siteId: "",
    count: 15,
    topicHint: ""
  });

  function reset() {
    step.value = "config";
    candidates.value = [];
    selectedCandidates.value = [];
    previewSiteId.value = "";
    fromGsc.value = false;
  }

  async function ensureSites() {
    if (sites.value.length > 0) return;
    sitesLoading.value = true;
    try {
      sites.value = await listSites(projectId);
    } finally {
      sitesLoading.value = false;
    }
  }

  async function open(options?: { topicHint?: string; siteId?: string; fromGsc?: boolean }) {
    reset();
    form.siteId = options?.siteId ?? sites.value[0]?.id ?? "";
    form.count = 15;
    form.topicHint = options?.topicHint ?? "";
    fromGsc.value = options?.fromGsc ?? false;
    visible.value = true;
    await ensureSites();
    if (!form.siteId && sites.value[0]) {
      form.siteId = sites.value[0].id;
    }
  }

  function openFromGscQueries(queries: string[], siteId?: string) {
    return open({
      topicHint: buildGscSeedTopicHint(queries),
      siteId,
      fromGsc: true
    });
  }

  function handleSelectionChange(rows: KeywordSeedCandidate[]) {
    selectedCandidates.value = rows;
  }

  async function submitPreview() {
    generating.value = true;
    try {
      const result = await previewKeywordSeeds(projectId, {
        siteId: form.siteId || undefined,
        count: form.count,
        topicHint: form.topicHint.trim() || undefined
      });
      candidates.value = result.keywords;
      previewSiteId.value = result.siteId;
      step.value = "preview";
      await nextTick();
      const selectable = candidates.value.filter((row) => !row.alreadyExists);
      selectedCandidates.value = selectable;
      selectable.forEach((row) => {
        dialogUiRef?.value?.previewTableRef?.toggleRowSelection(row, true);
      });
      if (selectable.length === 0) {
        message("生成的词均已在关键词池中", { type: "warning" });
      }
    } finally {
      generating.value = false;
    }
  }

  async function submitConfirm() {
    if (selectedCandidates.value.length === 0) {
      message("请至少勾选一个关键词", { type: "warning" });
      return;
    }
    confirming.value = true;
    try {
      const result = await confirmKeywordSeeds(projectId, {
        siteId: previewSiteId.value || form.siteId || undefined,
        keywords: selectedCandidates.value.map((row) => ({
          keyword: row.keyword,
          intent: row.intent,
          businessValueScore: row.businessValueScore,
          contentFitScore: row.contentFitScore,
          rationale: row.rationale
        }))
      });
      const skippedText = result.skipped > 0 ? `，跳过 ${result.skipped} 个重复` : "";
      message(`已加入 ${result.created} 个关键词${skippedText}`, { type: "success" });
      visible.value = false;
      await onConfirmed();
    } catch (error) {
      message(error instanceof Error ? error.message : "加入失败", { type: "error" });
    } finally {
      confirming.value = false;
    }
  }

  function goBackToConfig() {
    step.value = "config";
  }

  return {
    visible,
    fromGsc,
    step,
    candidates,
    selectedCandidates,
    generating,
    confirming,
    sitesLoading,
    sites,
    form,
    reset,
    open,
    openFromGscQueries,
    handleSelectionChange,
    submitPreview,
    submitConfirm,
    goBackToConfig
  };
}
