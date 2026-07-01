/** 媒体资产单文件上限（5MB） */
export const MEDIA_ASSET_MAX_BYTES = 5 * 1024 * 1024;

/** 允许入库的 MIME 类型 */
export const MEDIA_ASSET_ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

/** 签名 URL 有效期（365 天） */
export const MEDIA_ASSET_SIG_TTL_MS = 365 * 24 * 60 * 60 * 1000;

/** 远程图片下载超时（BFL 等临时 URL 需尽快拉取） */
export const MEDIA_ASSET_REMOTE_FETCH_TIMEOUT_MS = 60_000;
