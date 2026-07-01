/**
 * 项目媒体资产上传（配图面板与编辑器共用）。
 */
import { ref } from "vue";
import { uploadMediaAsset } from "@/api/platform/media";
import { message } from "@/utils/message";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_BYTES = 10 * 1024 * 1024;

export function useMediaAssetUpload(projectId: () => string | undefined) {
  const uploading = ref(false);

  async function upload(file: File) {
    const pid = projectId();
    if (!pid) {
      throw new Error("项目 ID 无效");
    }
    if (!ALLOWED_MIME.has(file.type)) {
      throw new Error("仅支持 JPEG、PNG、WebP、GIF 图片");
    }
    if (file.size > MAX_BYTES) {
      throw new Error("图片不能超过 10MB");
    }

    uploading.value = true;
    try {
      return await uploadMediaAsset(pid, file);
    } finally {
      uploading.value = false;
    }
  }

  async function uploadWithToast(file: File) {
    try {
      return await upload(file);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "上传失败";
      message(msg, { type: "error" });
      throw error;
    }
  }

  return { uploading, upload, uploadWithToast };
}
