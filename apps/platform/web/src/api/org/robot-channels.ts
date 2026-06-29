/**
 * 钉钉/飞书机器人通道 API（/api/v1/org/robot-channels）。
 */

import { http } from "@/utils/http";
import type { WmApiResponse } from "@/api/platform/types";

export interface OrgRobotChannelItem {
  id: string;
  channelType: "dingtalk" | "feishu";
  webhookUrl: string;
  isActive: boolean;
  events: string[];
  createdAt: string;
  updatedAt?: string;
}

export const ROBOT_EVENT_OPTIONS = [
  { value: "brief_pending", label: "大纲待确认" },
  { value: "job_failed", label: "任务失败" },
  { value: "assigned", label: "任务被指派" },
  { value: "quota_low", label: "配额告警" }
] as const;

export const ROBOT_CHANNEL_TYPE_OPTIONS = [
  { value: "dingtalk", label: "钉钉" },
  { value: "feishu", label: "飞书" }
] as const;

export async function listOrgRobotChannels(): Promise<OrgRobotChannelItem[]> {
  const res = await http.request<WmApiResponse<OrgRobotChannelItem[]>>(
    "get",
    "/api/v1/org/robot-channels"
  );
  return res.data ?? [];
}

export async function createOrgRobotChannel(payload: {
  channelType: string;
  webhookUrl: string;
  events: string[];
}): Promise<OrgRobotChannelItem> {
  const res = await http.request<WmApiResponse<OrgRobotChannelItem>>(
    "post",
    "/api/v1/org/robot-channels",
    { data: payload }
  );
  return res.data;
}

export async function updateOrgRobotChannel(
  id: string,
  payload: {
    channelType?: string;
    webhookUrl?: string;
    events?: string[];
    isActive?: boolean;
  }
): Promise<OrgRobotChannelItem> {
  const res = await http.request<WmApiResponse<OrgRobotChannelItem>>(
    "patch",
    `/api/v1/org/robot-channels/${id}`,
    { data: payload }
  );
  return res.data;
}

export async function deleteOrgRobotChannel(id: string): Promise<void> {
  await http.request("delete", `/api/v1/org/robot-channels/${id}`);
}
