import { describe, expect, it } from "vitest";
import {
  buildOutcomeSummaryDesc,
  buildSeoVerdictDesc,
  buildSeoVerdictTitle,
  fixesNavLabel,
  isSeoReleaseReady,
  issuesTabLabel
} from "./job-seo-issues";

describe("isSeoReleaseReady", () => {
  it("requires both local and semrush pass", () => {
    expect(isSeoReleaseReady(true, true)).toBe(true);
    expect(isSeoReleaseReady(true, false)).toBe(false);
    expect(isSeoReleaseReady(false, true)).toBe(false);
  });
});

describe("buildSeoVerdictTitle", () => {
  it("uses publish-first headline when release ready", () => {
    expect(
      buildSeoVerdictTitle({
        localScore: 93,
        semrushScore: 9.4,
        localPassed: true,
        semrushPassed: true
      })
    ).toBe("可发布 · 本地 93/100 · Semrush 9.4/10");
  });

  it("keeps blocking tone when not release ready", () => {
    expect(
      buildSeoVerdictTitle({
        localScore: 88,
        semrushScore: 8.2,
        localPassed: false,
        semrushPassed: false
      })
    ).toBe("本地 88/100 待提升 · Semrush 8.2/10 待提升");
  });
});

describe("buildSeoVerdictDesc", () => {
  it("frames residual issues as optional polish after pass", () => {
    expect(
      buildSeoVerdictDesc({
        releaseReady: true,
        issueCount: 6,
        suggestionCount: 17,
        hasDraftContent: true
      })
    ).toBe("另有 6 处可读性细节可精修（不影响发布） · 17 条优化建议");
  });

  it("uses blocking copy before pass", () => {
    expect(
      buildSeoVerdictDesc({
        releaseReady: false,
        issueCount: 6,
        suggestionCount: 0,
        hasDraftContent: true
      })
    ).toBe("6 项待修复，修好后再发布");
  });
});

describe("fixesNavLabel", () => {
  it("switches nav label by release state", () => {
    expect(fixesNavLabel(true)).toBe("可读性细节");
    expect(fixesNavLabel(false)).toBe("待修复");
  });
});

describe("issuesTabLabel", () => {
  it("renames issue tab after pass", () => {
    expect(issuesTabLabel(true, 6)).toBe("可读性细节 (6)");
    expect(issuesTabLabel(false, 6)).toBe("问题定位 (6)");
  });
});

describe("buildOutcomeSummaryDesc", () => {
  it("does not contradict release-ready state", () => {
    expect(
      buildOutcomeSummaryDesc({
        releaseReady: true,
        issueCount: 6,
        hasDraftContent: true
      })
    ).toContain("不影响发布");
  });
});
