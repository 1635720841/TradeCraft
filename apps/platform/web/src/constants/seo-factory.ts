/** 开发环境种子数据 ID（合法 UUID v4，与 prisma/seed.mjs 一致） */
export const DEV_SEED_PROJECT_ID = "00000000-0000-4000-8000-000000000002";
export const DEV_SEED_SITE_ID = "00000000-0000-4000-8000-000000000003";

/** 与后端 LOCAL_SEO_PASS_THRESHOLD 保持一致（本地预检） */
export const LOCAL_SEO_PASS_THRESHOLD = 95;

/** 与后端 SEMRUSH_PASS_THRESHOLD 保持一致（终检权威分） */
export const SEMRUSH_PASS_THRESHOLD = 9.0;

/** 手动 Semrush 检测超过此时长无结果视为僵死（与后端一致） */
export const SEMRUSH_MANUAL_CHECK_STALE_MS = 5 * 60 * 1000;

/** 工作流 OPTIMIZING 无心跳超过此时长视为僵死（与后端一致） */
export const SEMRUSH_OPTIMIZING_ORPHAN_STALE_MS = 8 * 60 * 1000;
