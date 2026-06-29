/**
 * 任务详情导出与 CMS 发布动作。
 */
import { computed, ref, type MaybeRefOrGetter, toValue } from "vue";
import type { ArticleJobItem } from "@/api/seo-factory/types";
import {
  downloadArticleExportHtml,
  downloadArticleExportJsonLd,
  downloadArticleExportPackage,
  publishArticleJob
} from "@/api/seo-factory/article-job";
import {
  canPublishJobToCms,
  cmsPublishActionLabel
} from "@/utils/seo-factory/cms-publish-status";
import { message } from "@/utils/message";

export function useJobExportActions(options: {
  projectId: MaybeRefOrGetter<string>;
  jobId: MaybeRefOrGetter<string>;
  job: MaybeRefOrGetter<ArticleJobItem | null | undefined>;
  exportStale: MaybeRefOrGetter<boolean>;
  onPublished?: () => void | Promise<void>;
}) {
  const exportDownloading = ref<"html" | "jsonld" | "package" | null>(null);
  const cmsPublishing = ref(false);

  const cmsPublishResult = computed(
    () => toValue(options.job)?.seoCheckData?.cmsPublish ?? null
  );

  const canPublishToCms = computed(
    () => {
      const job = toValue(options.job);
      return (
        job?.status === "COMPLETED" &&
        Boolean(job.outputUrl) &&
        canPublishJobToCms(job)
      );
    }
  );

  const cmsPublishButtonLabel = computed(() => {
    const job = toValue(options.job);
    return job ? cmsPublishActionLabel(job) : "推送到 CMS";
  });

  async function handlePublishToCms() {
    if (!canPublishToCms.value || cmsPublishing.value) return;

    cmsPublishing.value = true;
    try {
      const result = await publishArticleJob(toValue(options.projectId), toValue(options.jobId));
      const published =
        result.status === "publish" ||
        result.status === "published" ||
        (result.provider === "shopify" && result.publishedRequested);
      message(published ? "已发布到 CMS" : "已推送到 CMS 草稿", {
        type: "success"
      });
      await options.onPublished?.();
    } catch (error) {
      const msg = error instanceof Error ? error.message : "CMS 发布失败";
      message(msg, { type: "error" });
    } finally {
      cmsPublishing.value = false;
    }
  }

  async function handleDownloadExport(kind: "html" | "jsonld" | "package") {
    const job = toValue(options.job);
    if (!job?.outputUrl || exportDownloading.value) return;

    exportDownloading.value = kind;
    try {
      const projectId = toValue(options.projectId);
      const jobId = toValue(options.jobId);
      const blob =
        kind === "html"
          ? await downloadArticleExportHtml(projectId, jobId)
          : kind === "jsonld"
            ? await downloadArticleExportJsonLd(projectId, jobId)
            : await downloadArticleExportPackage(projectId, jobId);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const baseName = job.targetKeyword || "article";
      anchor.href = url;
      anchor.download =
        kind === "html"
          ? `${baseName}.html`
          : kind === "jsonld"
            ? `${baseName}.jsonld`
            : `${baseName}.zip`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "导出下载失败";
      message(msg, { type: "error" });
    } finally {
      exportDownloading.value = null;
    }
  }

  return {
    exportDownloading,
    cmsPublishing,
    cmsPublishResult,
    canPublishToCms,
    cmsPublishButtonLabel,
    handlePublishToCms,
    handleDownloadExport
  };
}
