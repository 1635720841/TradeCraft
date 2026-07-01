/**
 * 项目媒体资产库 API。
 */

import { platformApiPath } from "@/api/platform/paths";
import { http } from "@/utils/http";
import type { WmApiResponse } from "@/api/platform/types";

export interface MediaAsset {
  id: string;
  projectId: string;
  contentType: string;
  sizeBytes: number;
  source: "bfl" | "upload" | "url";
  sourceMeta: Record<string, unknown> | null;
  referenceCount: number;
  url: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

function projectMediaBase(projectId: string) {
  return platformApiPath(projectId, "media");
}

export async function listMediaAssets(
  projectId: string,
  params?: { page?: number; limit?: number; source?: "BFL" | "UPLOAD" | "URL" },
) {
  const res = await http.request<WmApiResponse<MediaAsset[]>>(
    "get",
    projectMediaBase(projectId),
    { params },
  );
  return res.data;
}

export async function uploadMediaAsset(projectId: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await http.request<WmApiResponse<MediaAsset>>(
    "post",
    projectMediaBase(projectId),
    {
      data: form,
      headers: { "Content-Type": "multipart/form-data" },
    },
  );
  return res.data;
}

export async function deleteMediaAsset(projectId: string, assetId: string) {
  await http.request<WmApiResponse<{ id: string }>>(
    "delete",
    `${projectMediaBase(projectId)}/${assetId}`,
  );
}
