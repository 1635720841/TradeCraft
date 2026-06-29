/**
 * Webhook URL SSRF 防护：仅允许公网 HTTPS 端点。
 */

import { BusinessException } from '../../core/exceptions/business.exception';
import { ErrorCodes } from '../../core/exceptions/error-codes';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '[::1]',
  'metadata.google.internal',
]);

function isPrivateIpv4(host: string): boolean {
  const parts = host.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isPrivateIpv6(host: string): boolean {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (normalized.startsWith('fe80')) return true;
  return false;
}

/** 校验出站 Webhook URL，不通过则抛 BusinessException */
export function assertSafeWebhookUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new BusinessException(ErrorCodes.VALIDATION_ERROR, 'Webhook URL 格式无效');
  }

  if (parsed.protocol !== 'https:') {
    throw new BusinessException(ErrorCodes.VALIDATION_ERROR, 'Webhook URL 必须使用 HTTPS');
  }

  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new BusinessException(ErrorCodes.VALIDATION_ERROR, 'Webhook URL 不允许指向本地或内网地址');
  }

  if (isPrivateIpv4(hostname) || isPrivateIpv6(hostname)) {
    throw new BusinessException(ErrorCodes.VALIDATION_ERROR, 'Webhook URL 不允许指向本地或内网地址');
  }

  if (parsed.username || parsed.password) {
    throw new BusinessException(ErrorCodes.VALIDATION_ERROR, 'Webhook URL 不允许包含认证信息');
  }

  return trimmed;
}
