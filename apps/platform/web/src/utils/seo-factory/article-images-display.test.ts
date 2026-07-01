import { describe, expect, it } from "vitest";
import { resolveArticleImagesForDisplay } from "./article-images-display";

describe("resolveArticleImagesForDisplay", () => {
  it("merges metadata with markdown images", () => {
    const content = "![hero](https://cdn.example/a.jpg)\n\nText";
    const images = resolveArticleImagesForDisplay(content, [
      { alt: "hero", url: "https://cdn.example/a.jpg", source: "bfl" }
    ]);
    expect(images).toHaveLength(1);
    expect(images[0]?.alt).toBe("hero");
  });

  it("falls back to markdown when metadata empty", () => {
    const content = "![x](https://cdn.example/b.png)";
    const images = resolveArticleImagesForDisplay(content, []);
    expect(images).toHaveLength(1);
    expect(images[0]?.url).toContain("b.png");
  });
});
