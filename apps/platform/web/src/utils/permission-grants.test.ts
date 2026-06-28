import { describe, expect, it } from "vitest";
import { expandPermissionGrantIds } from "./permission-grants";

describe("expandPermissionGrantIds", () => {
  it("returns same ids when no implies", () => {
    expect(expandPermissionGrantIds(["seo:job:read"], {})).toEqual(["seo:job:read"]);
  });

  it("expands implied permissions", () => {
    const result = expandPermissionGrantIds(["project:update"], {
      "project:update": ["project:read"]
    });
    expect(result).toContain("project:update");
    expect(result).toContain("project:read");
  });
});
