/**
 * 平台运营控制台 API（/api/v1/console）— barrel 导出。
 */

export * from "./types";
export * from "./overview";
export * from "./tenants";
export * from "./access";
export * from "./audit";
export * from "./health";

/** @deprecated 请改用 constants/dicts/platform auditActionDict */
export { auditActionDict as AUDIT_ACTION_OPTIONS } from "@/constants/dicts/platform";
