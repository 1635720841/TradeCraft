import type { InjectionKey, Ref } from "vue";
import type { KeywordSummary } from "@/api/seo-factory/keyword";

export interface KeywordSchedulingContext {
  summary: Ref<KeywordSummary | null>;
  refreshSummary: () => Promise<void>;
}

export const keywordSchedulingContextKey: InjectionKey<KeywordSchedulingContext> =
  Symbol("keywordSchedulingContext");
