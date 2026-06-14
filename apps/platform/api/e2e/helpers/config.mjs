/**
 * E2E 环境配置（可通过环境变量覆盖）。
 */

export const E2E_API_BASE_URL = (process.env.E2E_API_BASE_URL ?? 'http://127.0.0.1:3000').replace(
  /\/$/,
  '',
);

export const E2E_DEV_EMAIL = process.env.E2E_DEV_EMAIL ?? 'admin@dev.local';
export const E2E_DEV_PASSWORD = process.env.E2E_DEV_PASSWORD ?? 'admin123';
export const E2E_PROJECT_ID =
  process.env.E2E_PROJECT_ID ?? '00000000-0000-4000-8000-000000000002';

export const E2E_SKIP = process.env.E2E_SKIP === 'true';
export const E2E_REQUIRED = process.env.E2E_REQUIRED === 'true';

export const E2E_STATUS_POLL_INTERVAL_MS = Number(process.env.E2E_STATUS_POLL_INTERVAL_MS ?? 2000);
export const E2E_STATUS_POLL_TIMEOUT_MS = Number(process.env.E2E_STATUS_POLL_TIMEOUT_MS ?? 90_000);
