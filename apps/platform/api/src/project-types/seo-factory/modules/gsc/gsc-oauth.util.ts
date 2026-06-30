/**
 * GSC OAuth state 签名工具（防篡改）。
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { GscOAuthStatePayload } from './gsc.constants';

function resolveStateSecret(): string {
  const explicit = process.env.GOOGLE_GSC_STATE_SECRET?.trim();
  if (explicit) return explicit;

  const jwtSecret = process.env.AUTH_JWT_SECRET?.trim();
  if (jwtSecret) return jwtSecret;

  const nodeEnv = process.env.NODE_ENV ?? 'development';
  if (nodeEnv === 'production') {
    throw new Error('生产环境必须设置 GOOGLE_GSC_STATE_SECRET 或 AUTH_JWT_SECRET');
  }

  return 'dev-gsc-state-secret';
}

export function signGscOAuthState(payload: GscOAuthStatePayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', resolveStateSecret()).update(body).digest('base64url');
  return `${body}.${signature}`;
}

export function verifyGscOAuthState(state: string): GscOAuthStatePayload | null {
  const [body, signature] = state.split('.');
  if (!body || !signature) return null;

  const expected = createHmac('sha256', resolveStateSecret()).update(body).digest('base64url');
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as GscOAuthStatePayload;
    if (!payload.exp) {
      return null;
    }
    if (Date.now() > payload.exp) {
      return null;
    }
    const mode = payload.mode ?? (payload.siteId ? 'site' : 'platform');
    if (mode === 'platform') {
      return { ...payload, mode: 'platform' };
    }
    if (!payload.siteId || !payload.organizationId || !payload.projectId) {
      return null;
    }
    return { ...payload, mode: 'site' };
  } catch {
    return null;
  }
}

export function formatGscDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** GSC Search Analytics 至少需要 Owner 或 Full 权限 */
export const GSC_USABLE_PERMISSION_LEVELS = new Set(['siteOwner', 'siteFullUser']);

export function filterUsableGscPropertyEntries(
  entries: Array<{ siteUrl?: string | null; permissionLevel?: string | null }>,
): string[] {
  return entries
    .filter(
      (item) =>
        item.siteUrl &&
        item.permissionLevel &&
        GSC_USABLE_PERMISSION_LEVELS.has(item.permissionLevel),
    )
    .map((item) => item.siteUrl as string);
}

/** 将 Google API 英文错误转为可操作中文提示 */
export function formatGscUserError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes('does not have sufficient permission')) {
    return (
      '当前平台授权的 Google 账号对该 Search Console 资源权限不足（需「所有者」或「完全」权限）。' +
      '请在 Google Search Console → 设置 → 用户和权限 中授予该账号，或改用资源 Owner 账号重新授权平台 GSC。'
    );
  }
  if (lower.includes('not found') && lower.includes('site')) {
    return 'Search Console 中找不到该资源，请确认域名已验证且资源 URL 正确。';
  }
  return raw;
}

export function normalizeDomain(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^sc-domain:/, '')
    .replace(/\/+$/, '')
    .replace(/^www\./, '');
}

export function propertyMatchesSiteDomain(propertyUrl: string, siteDomain: string): boolean {
  const normalizedSite = normalizeDomain(siteDomain);
  const normalizedProperty = normalizeDomain(propertyUrl);
  if (!normalizedSite || !normalizedProperty) return false;

  return (
    normalizedProperty === normalizedSite ||
    normalizedProperty.endsWith(`.${normalizedSite}`) ||
    normalizedSite.endsWith(`.${normalizedProperty}`)
  );
}

export function matchGscPropertyUrl(siteDomain: string, entries: string[]): string | null {
  const normalizedSite = normalizeDomain(siteDomain);
  if (!normalizedSite) return null;

  const siteHost = siteDomain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');

  const httpsEntries = entries.filter((entry) => /^https:\/\//i.test(entry));

  // 已验证的 URL 前缀资源优先于 sc-domain（后者常出现在「未验证」列表且无法拉取数据）
  for (const entry of httpsEntries) {
    try {
      const host = new URL(entry).hostname.toLowerCase();
      if (host === siteHost) {
        return entry;
      }
    } catch {
      /* ignore malformed URL */
    }
  }

  for (const entry of httpsEntries) {
    if (propertyMatchesSiteDomain(entry, siteDomain)) {
      return entry;
    }
  }

  const scDomain = `sc-domain:${normalizedSite}`;
  if (entries.includes(scDomain)) {
    return scDomain;
  }

  for (const entry of entries) {
    if (normalizeDomain(entry) === normalizedSite) {
      return entry;
    }
  }

  for (const entry of entries) {
    const normalizedEntry = normalizeDomain(entry);
    if (
      normalizedEntry.endsWith(`.${normalizedSite}`) ||
      normalizedSite.endsWith(`.${normalizedEntry}`)
    ) {
      return entry;
    }
  }

  return null;
}

/** 归一化页面 URL 用于 GSC 页面与 CMS 文章链接匹配 */
export function normalizePageUrlForMatch(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';

  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(withProtocol);
    const path = parsed.pathname.replace(/\/+$/, '') || '/';
    return `${parsed.hostname.replace(/^www\./, '').toLowerCase()}${path}`;
  } catch {
    return trimmed
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/+$/, '');
  }
}

export function pageUrlsMatchForGsc(gscPageUrl: string, publishedUrl: string): boolean {
  const left = normalizePageUrlForMatch(gscPageUrl);
  const right = normalizePageUrlForMatch(publishedUrl);
  if (!left || !right) return false;
  return left === right || left.endsWith(right) || right.endsWith(left);
}
