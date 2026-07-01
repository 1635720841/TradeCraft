/**
 * 启动前环境变量校验（INF-003）。
 */

const REQUIRED_ENV_KEYS = ['DATABASE_URL', 'REDIS_URL'] as const;

const FEATURE_ENV_GROUPS: Record<string, readonly string[]> = {
  gsc: ['GOOGLE_GSC_CLIENT_ID', 'GOOGLE_GSC_CLIENT_SECRET', 'GOOGLE_GSC_REDIRECT_URI'],
  llm: ['LLM_API_KEY'],
  s3: ['S3_BUCKET'],
};

const DEFAULT_CORS_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:8848',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:8848',
];

export function assertFeatureEnv(feature: keyof typeof FEATURE_ENV_GROUPS): void {
  const keys = FEATURE_ENV_GROUPS[feature];
  const missing = keys.filter((key) => !process.env[key]?.trim());
  if (missing.length === 0) return;

  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const message = `[env] 功能 ${feature} 缺少配置：${missing.join(', ')}`;
  if (nodeEnv === 'production') {
    throw new Error(message);
  }
  console.warn(message);
}

export function readCorsOrigins(): string[] | boolean {
  const raw = process.env.CORS_ORIGINS?.trim();
  if (!raw) {
    const nodeEnv = process.env.NODE_ENV ?? 'development';
    return nodeEnv === 'production' ? false : DEFAULT_CORS_ORIGINS;
  }
  if (raw === '*') {
    return true;
  }
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function validateRequiredEnv(): void {
  const missing = REQUIRED_ENV_KEYS.filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `缺少必填环境变量：${missing.join(', ')}。请复制 .env.example 到 apps/platform/api/.env 并填写。`,
    );
  }

  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const apiPort = Number(process.env.API_PORT ?? '3000');
  if (!Number.isFinite(apiPort) || apiPort < 1 || apiPort > 65535) {
    throw new Error('API_PORT 必须是 1–65535 之间的有效端口号。');
  }

  if (nodeEnv === 'production' && !process.env.AUTH_JWT_SECRET?.trim()) {
    throw new Error('生产环境必须设置 AUTH_JWT_SECRET（至少 16 字符）。');
  }
  if (nodeEnv === 'production' && !process.env.WEB_APP_ORIGIN?.trim()) {
    throw new Error('生产环境必须设置 WEB_APP_ORIGIN（前端访问地址，用于 CORS 与 OAuth 回调）。');
  }
  if (nodeEnv === 'production' && !process.env.SECRET_CIPHER_KEY?.trim()) {
    console.warn(
      '[env] 生产环境建议设置 SECRET_CIPHER_KEY（与 AUTH_JWT_SECRET 分离）；当前回退使用 AUTH_JWT_SECRET 派生加密密钥。',
    );
  }
  if (nodeEnv === 'production' && process.env.SMTP_HOST?.trim() && !process.env.SMTP_FROM?.trim()) {
    console.warn('[env] 已配置 SMTP_HOST 但缺少 SMTP_FROM，邮件通知可能无法正确发送。');
  }
}
