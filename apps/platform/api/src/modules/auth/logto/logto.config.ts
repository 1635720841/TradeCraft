/**
 * Logto OIDC 配置读取与开关。
 *
 * 边界：
 * - 不负责：令牌交换（LogtoAuthService）
 *
 * 入口：
 * - isLogtoEnabled / readLogtoConfig
 */

export interface LogtoConfig {
  endpoint: string;
  appId: string;
  appSecret: string;
  redirectUri: string;
}

export function isLogtoEnabled(): boolean {
  return readLogtoConfig() !== null;
}

export function readLogtoConfig(): LogtoConfig | null {
  const endpoint = process.env.LOGTO_ENDPOINT?.trim().replace(/\/$/, '');
  const appId = process.env.LOGTO_APP_ID?.trim();
  const appSecret = process.env.LOGTO_APP_SECRET?.trim();
  if (!endpoint || !appId || !appSecret) {
    return null;
  }

  const webPort = process.env.WEB_PORT?.trim() || '5173';
  const redirectUri =
    process.env.LOGTO_REDIRECT_URI?.trim() ||
    `http://localhost:${webPort}/#/login/callback`;

  return { endpoint, appId, appSecret, redirectUri };
}

export function isLocalLoginAllowed(): boolean {
  return process.env.AUTH_ALLOW_LOCAL_LOGIN !== 'false';
}

export function buildLogtoAuthorizeUrl(state?: string): string | null {
  const cfg = readLogtoConfig();
  if (!cfg) {
    return null;
  }

  const params = new URLSearchParams({
    client_id: cfg.appId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: 'openid profile email',
  });
  if (state) {
    params.set('state', state);
  }
  return `${cfg.endpoint}/oidc/auth?${params.toString()}`;
}
