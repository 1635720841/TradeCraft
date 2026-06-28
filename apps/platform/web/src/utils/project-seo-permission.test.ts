import { describe, expect, it } from "vitest";
import { hasProjectSeoPermission } from "./project-seo-permission";

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
