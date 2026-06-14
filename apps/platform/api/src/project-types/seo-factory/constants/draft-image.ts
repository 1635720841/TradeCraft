/** 稿件正文插图单文件上限（5MB） */
export const DRAFT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** 允许上传的 MIME 类型 */
export const DRAFT_IMAGE_ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

/** 签名 URL 有效期（365 天） */
export const DRAFT_IMAGE_SIG_TTL_MS = 365 * 24 * 60 * 60 * 1000;
