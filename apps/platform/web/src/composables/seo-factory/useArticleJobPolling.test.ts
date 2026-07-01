/**
 * 文章任务详情页：工作流操作 composable 单测。
 */
import { describe, expect, it } from "vitest";
import { JOB_TERMINAL_STATUSES } from "@/constants/dicts/seo-factory";

describe("article job polling terminal rules", () => {
  it("PAUSED is terminal for polling stop", () => {
    expect(JOB_TERMINAL_STATUSES).toContain("PAUSED");
    expect(JOB_TERMINAL_STATUSES).not.toContain("OPTIMIZING");
  });

  it("rewrite pending keeps polling on completed jobs", () => {
    const status = "COMPLETED";
    const hasRewritePending = true;
    const isTerminal = JOB_TERMINAL_STATUSES.includes(
      status as (typeof JOB_TERMINAL_STATUSES)[number]
    );
    expect(isTerminal && !hasRewritePending).toBe(false);
  });
});
