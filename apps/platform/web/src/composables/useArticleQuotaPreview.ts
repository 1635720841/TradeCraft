/**
 * 入队前配额预览：拉取企业配额并校验本次消耗是否足够。
 */

import { computed, ref } from "vue";
import { getBillingQuota, type QuotaSummary } from "@/api/org/billing";

export function useArticleQuotaPreview() {
  const quota = ref<QuotaSummary | null>(null);
  const loading = ref(false);

  async function refreshQuota() {
    loading.value = true;
    try {
      quota.value = await getBillingQuota();
    } catch {
      quota.value = null;
    } finally {
      loading.value = false;
    }
  }

  function canConsume(count: number): boolean {
    if (!quota.value || count <= 0) return true;
    return quota.value.remaining >= count;
  }

  function previewText(count: number): string {
    if (!quota.value) return "正在加载配额…";
    const remaining = quota.value.remaining;
    if (count <= 0) return `剩余 ${remaining} 篇`;
    return `本次 ${count} 篇，剩余 ${remaining} 篇`;
  }

  const insufficientMessage = computed(() => {
    if (!quota.value) return "";
    if (quota.value.remaining <= 0) {
      return "本账期配额已用尽，请联系管理员续期或加购。";
    }
    return "";
  });

  return {
    quota,
    loading,
    refreshQuota,
    canConsume,
    previewText,
    insufficientMessage
  };
}
