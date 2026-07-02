import { describe, expect, it } from "vitest";
import { ref } from "vue";
import { runLoad } from "@/composables/run-load";

describe("runLoad", () => {
  it("sets error and keeps previous data on failure", async () => {
    const loading = ref(false);
    const error = ref<string | null>(null);
    let data = ["keep-me"];

    const ok = await runLoad(
      async () => {
        throw new Error("network down");
      },
      {
        setLoading: (value) => {
          loading.value = value;
        },
        setError: (value) => {
          error.value = value;
        },
        onSuccess: (result) => {
          data = result as string[];
        },
        fallbackMessage: "加载失败"
      }
    );

    expect(ok).toBe(false);
    expect(error.value).toBe("network down");
    expect(data).toEqual(["keep-me"]);
    expect(loading.value).toBe(false);
  });

  it("clears error and updates data on success", async () => {
    const loading = ref(false);
    const error = ref<string | null>("old");
    let data: string[] = [];

    const ok = await runLoad(
      async () => ["a", "b"],
      {
        setLoading: (value) => {
          loading.value = value;
        },
        setError: (value) => {
          error.value = value;
        },
        onSuccess: (result) => {
          data = result;
        }
      }
    );

    expect(ok).toBe(true);
    expect(error.value).toBeNull();
    expect(data).toEqual(["a", "b"]);
  });
});
