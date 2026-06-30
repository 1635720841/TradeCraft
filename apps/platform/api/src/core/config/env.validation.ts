/**
 * 启动前环境变量校验（INF-003）。
 */

const REQUIRED_ENV_KEYS = ['DATABASE_URL', 'REDIS_URL'] as const;

const FEATURE_ENV_GROUPS: Record<string, readonly string[]> = {
  gsc: ['GOOGLE_GSC_CLIENT_ID', 'GOOGLE_GSC_CLIENT_SECRET', 'GOOGLE_GSC_REDIRECT_URI'],
  llm: ['LLM_API_KEY'],
  s3: ['S3_BUCKET'],
};

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

export function validateRequiredEnv(): void {
  const missing = REQUIRED_ENV_KEYS.filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `缺少必填环境变量：${missing.join(', ')}。请复制 .env.example 到 apps/platform/api/.env 并填写。`,
    );
  }

  const nodeEnv = process.env.NODE_ENV ?? 'development';
  if (nodeEnv === 'production' && !process.env.AUTH_JWT_SECRET?.trim()) {
    throw new Error('生产环境必须设置 AUTH_JWT_SECRET（至少 16 字符）。');
  }
}
