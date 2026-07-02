import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/api/seo-factory/article-job", () => ({
  listArticleJobs: vi.fn()
}));

vi.mock("@/api/seo-factory/site", () => ({
  listSites: vi.fn().mockResolvedValue({ data: [] })
}));

vi.mock("vue-router", () => ({
  useRoute: () => ({ query: {}, params: { projectId: "p1" } }),
  useRouter: () => ({ replace: vi.fn() })
}));

import { listArticleJobs } from "@/api/seo-factory/article-job";
import { useJobListQuery } from "@/composables/seo-factory/useJobListQuery";

describe("useJobListQuery error state", () => {
  beforeEach(() => {
    vi.mocked(listArticleJobs).mockReset();
  });

  it("sets error on fetch failure and clears after retry", async () => {
    vi.mocked(listArticleJobs).mockRejectedValueOnce(new Error("列表加载失败"));

    const { error, retryFetchJobs, fetchJobs } = useJobListQuery("p1");
    await fetchJobs();

    expect(error.value).toBe("列表加载失败");

    vi.mocked(listArticleJobs).mockResolvedValueOnce({
      data: [],
      meta: { pagination: { total: 0 }, traceId: "t" }
    } as never);

    await retryFetchJobs();
    expect(error.value).toBeNull();
  });
});
