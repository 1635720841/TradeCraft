import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/api/seo-factory/keyword-cluster", () => ({
  listKeywordClusters: vi.fn()
}));

vi.mock("@/api/seo-factory/keyword", () => ({
  listKeywords: vi.fn().mockResolvedValue({ data: [], meta: { pagination: { total: 0 } } })
}));

vi.mock("vue-router", () => ({
  useRoute: () => ({ query: {}, params: { projectId: "p1" } }),
  useRouter: () => ({ replace: vi.fn() })
}));

import { listKeywordClusters } from "@/api/seo-factory/keyword-cluster";
import { useKeywordPoolData } from "@/composables/seo-factory/useKeywordPoolData";

describe("useKeywordPoolData error state", () => {
  beforeEach(() => {
    vi.mocked(listKeywordClusters).mockReset();
  });

  it("sets clustersError on failure", async () => {
    vi.mocked(listKeywordClusters).mockRejectedValueOnce(new Error("集群加载失败"));

    const { clustersError, loadClusters } = useKeywordPoolData("p1");
    await loadClusters();

    expect(clustersError.value).toBe("集群加载失败");
  });
});
