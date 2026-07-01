import { describe, expect, it } from "vitest";
import type { ArticleJobItem } from "@/api/seo-factory/types";
import { isArticleJobContentEditable, isArticleJobPipelineBusy } from "./article-job-editable";
import { resolveJobDisplayStatus } from "./job-list-status";
import { jobListProgressHint } from "./job-list-display";

function job(overrides: Partial<ArticleJobItem> = {}): ArticleJobItem {
  return {
    id: "j1",
    traceId: "tr_1",
    targetKeyword: "test",
    status: "QUEUED",
    ...overrides
  } as ArticleJobItem;
}

describe("article-job-editable", () => {
  it("blocks editing during pipeline busy statuses", () => {
    expect(isArticleJobPipelineBusy("OPTIMIZING")).toBe(true);
    expect(isArticleJobContentEditable(job({ status: "OPTIMIZING" }))).toBe(false);
  });

  it("allows editing when paused or completed", () => {
    expect(isArticleJobContentEditable(job({ status: "PAUSED" }))).toBe(true);
    expect(isArticleJobContentEditable(job({ status: "COMPLETED" }))).toBe(true);
  });

  it("blocks editing when cancelled or failed", () => {
    expect(isArticleJobContentEditable(job({ status: "CANCELLED" }))).toBe(false);
    expect(isArticleJobContentEditable(job({ status: "FAILED" }))).toBe(false);
  });
});

describe("resolveJobDisplayStatus", () => {
  it("maps queued resume breakpoint to workflow phase status", () => {
    const paused = job({
      status: "QUEUED",
      seoCheckData: {
        workflow: { pausedStep: "images" }
      }
    });
    expect(resolveJobDisplayStatus(paused)).toBe("ILLUSTRATING");
  });

  it("keeps paused status as-is", () => {
    expect(resolveJobDisplayStatus(job({ status: "PAUSED" }))).toBe("PAUSED");
  });
});

describe("jobListProgressHint", () => {
  it("shows breakpoint headline for paused jobs", () => {
    const hint = jobListProgressHint(
      job({
        status: "PAUSED",
        seoCheckData: { workflow: { pausedStep: "draft" } }
      })
    );
    expect(hint).toContain("暂停");
  });
});
