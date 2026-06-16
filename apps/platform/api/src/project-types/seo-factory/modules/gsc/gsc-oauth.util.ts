/**
 * GSC OAuth state 签名工具（防篡改）。
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { GscOAuthStatePayload } from './gsc.constants';

function resolveStateSecret(): string {
  return process.env.GOOGLE_GSC_STATE_SECRET?.trim() || process.env.AUTH_JWT_SECRET?.trim() || 'dev-gsc-state-secret';
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
    if (!payload.siteId || !payload.organizationId || !payload.projectId || !payload.exp) {
      return null;
    }
    if (Date.now() > payload.exp) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function formatGscDate(date: Date): string {
  return date.toISOString().slice(0, 10);
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

export function matchGscPropertyUrl(siteDomain: string, entries: string[]): string | null {
  const normalizedSite = normalizeDomain(siteDomain);
  if (!normalizedSite) return null;

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
      normalizedEntry === normalizedSite ||
      normalizedEntry.endsWith(`.${normalizedSite}`) ||
      normalizedSite.endsWith(`.${normalizedEntry}`)
    ) {
      return entry;
    }
  }

  return entries[0] ?? null;
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
