import { describe, expect, it } from "vitest";
import {
  evaluateReleaseReadiness,
  isSeoReleaseReady,
  WORKFLOW_STEPS
} from "@wm/shared-core";
import { inferCurrentWorkflowStep } from "./job-progress";
import { formatWorkflowProgressShort } from "./workflow-progress";
import type { ArticleJobItem, ArticleJobWorkflowProgress } from "@/api/seo-factory/types";

describe("evaluateReleaseReadiness", () => {
  it("passes when both scores meet thresholds", () => {
    const result = evaluateReleaseReadiness({
      localScore: 96,
      semrushScore: 9.2
    });
    expect(result.releaseReady).toBe(true);
    expect(result.gatesPassed).toBe(2);
  });

  it("reports gap text when not ready", () => {
    const result = evaluateReleaseReadiness({
      localScore: 90,
      semrushScore: 8.5
    });
    expect(result.releaseReady).toBe(false);
    expect(result.gapText).toContain("本地还差");
    expect(result.gapText).toContain("Semrush");
  });
});

describe("isSeoReleaseReady", () => {
  it("requires both gates", () => {
    expect(isSeoReleaseReady(true, true)).toBe(true);
    expect(isSeoReleaseReady(true, false)).toBe(false);
  });
});

describe("inferCurrentWorkflowStep", () => {
  const base = {
    status: "OPTIMIZING",
    draftData: {
      content: "# Title\n\nBody",
      internalLinksApplied: true,
      imagesApplied: true
    },
    seoCheckData: {}
  } as ArticleJobItem;

  it("maps paraphrasing phase", () => {
    expect(
      inferCurrentWorkflowStep({
        ...base,
        seoCheckData: {
          workflowProgress: {
            phase: "paraphrasing",
            message: "原创表达优化中",
            updatedAt: new Date().toISOString()
          }
        }
      })
    ).toBe("paraphrasing");
  });

  it("maps post-semrush paraphrase step", () => {
    expect(
      inferCurrentWorkflowStep({
        ...base,
        seoCheckData: { semrush: { passed: true } }
      })
    ).toBe("paraphrasing");
  });
});

describe("formatWorkflowProgressShort", () => {
  it("appends round suffix to message", () => {
    expect(
      formatWorkflowProgressShort({
        phase: "semrush",
        message: "Semrush 优化中",
        round: 2,
        maxRounds: 5,
        updatedAt: new Date().toISOString()
      } as ArticleJobWorkflowProgress)
    ).toBe("Semrush 优化中（2/5）");
  });

  it("shows semrush queue phase", () => {
    expect(
      formatWorkflowProgressShort({
        phase: "semrush-queue",
        message: "",
        updatedAt: new Date().toISOString()
      } as ArticleJobWorkflowProgress)
    ).toBe("Semrush 排队中，请稍候…");
  });
});

describe("WORKFLOW_STEPS contract", () => {
  it("has eight canonical steps", () => {
    expect(WORKFLOW_STEPS).toEqual([
      "serp",
      "brief",
      "draft",
      "linking",
      "images",
      "optimizing",
      "paraphrasing",
      "ymyl"
    ]);
  });
});
