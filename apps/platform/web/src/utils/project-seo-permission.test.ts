import { describe, expect, it } from "vitest";
import {
  canPublishSeoJob,
  canReviewSeoJob,
  hasProjectSeoPermission
} from "./project-seo-permission";

describe("hasProjectSeoPermission", () => {
  it("allows super admin bypass", () => {
    expect(
      hasProjectSeoPermission([], "seo:job:create", { superAdmin: true })
    ).toBe(true);
  });

  it("matches single required permission", () => {
    expect(
      hasProjectSeoPermission(["seo:job:read", "seo:keyword:manage"], "seo:job:read")
    ).toBe(true);
  });

  it("matches any of array requirements", () => {
    expect(
      hasProjectSeoPermission(["seo:job:read"], ["seo:job:create", "seo:job:read"])
    ).toBe(true);
  });

  it("denies when permission missing", () => {
    expect(hasProjectSeoPermission(["seo:job:read"], "seo:job:create")).toBe(false);
  });

  it("allows when required is undefined", () => {
    expect(hasProjectSeoPermission([], undefined)).toBe(true);
  });
});

describe("canReviewSeoJob", () => {
  it("allows reviewer with site manage only", () => {
    expect(canReviewSeoJob(["seo:job:read", "seo:site:manage"])).toBe(true);
  });

  it("allows reviewer with job review permission", () => {
    expect(canReviewSeoJob(["seo:job:read", "seo:job:review"])).toBe(true);
  });

  it("denies executor with job create only", () => {
    expect(canReviewSeoJob(["seo:job:read", "seo:job:create"])).toBe(false);
  });

  it("denies viewer", () => {
    expect(canReviewSeoJob(["seo:job:read"])).toBe(false);
  });
});

describe("canPublishSeoJob", () => {
  it("allows create or site manage", () => {
    expect(canPublishSeoJob(["seo:job:create"])).toBe(true);
    expect(canPublishSeoJob(["seo:site:manage"])).toBe(true);
    expect(canPublishSeoJob(["seo:job:review"])).toBe(false);
  });
});
