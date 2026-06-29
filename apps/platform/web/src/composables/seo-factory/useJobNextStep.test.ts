import { describe, expect, it } from "vitest";
import { ref } from "vue";
import type { ArticleJobItem } from "@/api/seo-factory/types";
import { useJobNextStep } from "@/composables/seo-factory/useJobNextStep";

function makeJob(overrides: Partial<ArticleJobItem> = {}): ArticleJobItem {
  return {
    id: "job-1",
    traceId: "trace-1",
    status: "COMPLETED",
    targetKeyword: "test keyword",
    outputUrl: "https://cdn.example.com/out.zip",
    localSeoScore: 88,
    semrushScore: 8.2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  } as ArticleJobItem;
}

describe("useJobNextStep", () => {
  it("prioritizes SEO diagnose before CMS when scores not ready", () => {
    const job = ref(makeJob());
    const next = useJobNextStep({
      job,
      briefPending: ref(false),
      exportStale: ref(false),
      requiresHumanReview: ref(false),
      ymylHumanReviewStatus: ref(undefined),
      cmsUiEnabled: true,
      canPublishToCms: ref(true),
      cmsPublishButtonLabel: ref("推送到 CMS 草稿"),
      handlers: {
        goBrief: () => {},
        goDiagnose: () => {},
        goArticle: () => {},
        handleRetry: () => {},
        handlePublishToCms: () => {},
        handleDownloadHtml: () => {},
        handleRerunOptimization: () => {}
      }
    });

    expect(next.value?.title).toContain("提升 SEO 分数");
    expect(next.value?.label).toBe("去诊断");
  });

  it("suggests CMS draft after release ready", () => {
    const job = ref(
      makeJob({
        localSeoScore: 96,
        semrushScore: 9.2
      })
    );
    const next = useJobNextStep({
      job,
      briefPending: ref(false),
      exportStale: ref(false),
      requiresHumanReview: ref(false),
      ymylHumanReviewStatus: ref(undefined),
      cmsUiEnabled: true,
      canPublishToCms: ref(true),
      cmsPublishButtonLabel: ref("推送到 CMS 草稿"),
      handlers: {
        goBrief: () => {},
        goDiagnose: () => {},
        goArticle: () => {},
        handleRetry: () => {},
        handlePublishToCms: () => {},
        handleDownloadHtml: () => {},
        handleRerunOptimization: () => {}
      }
    });

    expect(next.value?.title).toContain("CMS 草稿");
  });
});
