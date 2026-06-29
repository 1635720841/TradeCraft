/**
 * SEO 问题分组（诊断面板待修复/可读性细节）。
 */
import { computed, type MaybeRefOrGetter, toValue } from "vue";
import type { ArticleJobSeoCheckData } from "@/api/seo-factory/types";
import { getLocalMetrics } from "@wm/shared-core";

export type IssueSeverity = "error" | "warning" | "info";

export interface IssueItem {
  kind: string;
  meta?: string;
  text: string;
  severity: IssueSeverity;
}

export interface IssueGroup {
  kind: string;
  severity: IssueSeverity;
  hint: string;
  items: IssueItem[];
}

const ISSUE_HINTS: Record<string, string> = {
  超长段: "拆分为更短段落（建议每段 ≤ 65 词）",
  超长句: "拆成短句（建议 ≤ 22 词）",
  难读句: "简化句式、减少从句与复杂词",
  随意句: "改为更正式、书面的表达",
  复杂词: "替换为更易读的同义词"
};

export function severityIcon(severity: IssueSeverity): string {
  if (severity === "error") return "ri:error-warning-line";
  if (severity === "warning") return "ri:alert-line";
  return "ri:information-line";
}

export function useSeoIssueGroups(
  seoCheckData: MaybeRefOrGetter<ArticleJobSeoCheckData | null | undefined>,
  releaseReady: MaybeRefOrGetter<boolean>
) {
  const issueItems = computed((): IssueItem[] => {
    const metrics = getLocalMetrics(toValue(seoCheckData));
    if (!metrics) return [];

    const items: IssueItem[] = [];
    for (const sample of metrics.longParagraphSamples ?? []) {
      items.push({ kind: "超长段", meta: `${sample.wordCount} 词`, text: sample.text, severity: "error" });
    }
    for (const sample of metrics.longSentenceSamples ?? []) {
      items.push({ kind: "超长句", meta: `${sample.wordCount} 词`, text: sample.text, severity: "warning" });
    }
    for (const sample of metrics.hardToReadSentenceSamples ?? []) {
      items.push({ kind: "难读句", meta: `${sample.wordCount} 词`, text: sample.text, severity: "error" });
    }
    for (const sample of metrics.casualSentenceSamples ?? []) {
      items.push({ kind: "随意句", meta: sample.reason, text: sample.text, severity: "warning" });
    }
    for (const sample of metrics.semrushComplexWordSamples ?? []) {
      items.push({
        kind: "复杂词",
        text: `${sample.term} → ${sample.suggestion}`,
        severity: "warning"
      });
    }
    return items;
  });

  const issueGroups = computed((): IssueGroup[] => {
    const ready = toValue(releaseReady);
    const map = new Map<string, IssueGroup>();

    for (const item of issueItems.value) {
      const severity: IssueSeverity = ready ? "info" : item.severity;
      let group = map.get(item.kind);
      if (!group) {
        group = {
          kind: item.kind,
          severity,
          hint: ISSUE_HINTS[item.kind] ?? "",
          items: []
        };
        map.set(item.kind, group);
      }
      if (!ready && severity === "error") group.severity = "error";
      else if (!ready && severity === "warning" && group.severity !== "error") {
        group.severity = "warning";
      }
      group.items.push(item);
    }

    const severityOrder = (s: IssueSeverity) => (s === "error" ? 0 : s === "warning" ? 1 : 2);
    return [...map.values()].sort((a, b) => severityOrder(a.severity) - severityOrder(b.severity));
  });

  return { issueItems, issueGroups, severityIcon };
}
