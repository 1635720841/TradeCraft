/**
 * 媒体资产：存储 key、API 路径、签名 URL。
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { MEDIA_ASSET_SIG_TTL_MS } from './constants/media-asset';

const MEDIA_ASSET_ID_RE = /^[0-9a-f-]{36}$/i;
const MEDIA_ASSET_API_RE =
  /\/api\/v1\/projects\/([^/]+)\/media\/([^/?#]+)\/file/i;

export function buildMediaAssetStorageKey(
  organizationId: string,
  projectId: string,
  assetId: string,
  extension: string,
): string {
  const ext = extension.startsWith('.') ? extension : `.${extension}`;
  return `${organizationId}/${projectId}/media/${assetId}${ext}`;
}

export function buildMediaAssetApiPath(projectId: string, assetId: string): string {
  return `/api/v1/projects/${projectId}/media/${assetId}/file`;
}

export function assertMediaAssetId(assetId: string): void {
  if (!MEDIA_ASSET_ID_RE.test(assetId)) {
    throw new Error('invalid media asset id');
  }
}

export function extensionForMediaMime(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    case 'image/gif':
      return '.gif';
    default:
      return '.jpg';
  }
}

export function resolveExtensionFromContentType(
  contentType: string | undefined,
  url?: string,
): string {
  const fromMime = contentType?.split(';')[0]?.trim().toLowerCase();
  if (fromMime) {
    return extensionForMediaMime(fromMime);
  }

  const pathname = url?.split('?')[0]?.toLowerCase() ?? '';
  if (pathname.endsWith('.png')) return '.png';
  if (pathname.endsWith('.webp')) return '.webp';
  if (pathname.endsWith('.gif')) return '.gif';
  if (pathname.endsWith('.jpeg') || pathname.endsWith('.jpg')) return '.jpg';
  return '.jpg';
}

function mediaAssetSignSecret(): string {
  const secret = process.env.AUTH_JWT_SECRET?.trim();
  if (secret && secret.length >= 16) {
    return secret;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('生产环境必须设置 AUTH_JWT_SECRET（至少 16 字符）');
  }
  return 'wm-dev-jwt-secret-change-me';
}

function signPayload(payload: string): string {
  return createHmac('sha256', mediaAssetSignSecret()).update(payload).digest('hex');
}

export function createMediaAssetSignedQuery(
  projectId: string,
  assetId: string,
  nowMs = Date.now(),
): { exp: number; sig: string } {
  const exp = nowMs + MEDIA_ASSET_SIG_TTL_MS;
  const sig = signPayload(`${projectId}:${assetId}:${exp}`);
  return { exp, sig };
}

export function verifyMediaAssetSignedQuery(
  projectId: string,
  assetId: string,
  expRaw: string | undefined,
  sigRaw: string | undefined,
  nowMs = Date.now(),
): boolean {
  if (!expRaw || !sigRaw) return false;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp <= nowMs) return false;

  try {
    assertMediaAssetId(assetId);
  } catch {
    return false;
  }

  const expected = signPayload(`${projectId}:${assetId}:${exp}`);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(sigRaw, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function buildMediaAssetPublicUrl(projectId: string, assetId: string): string {
  const path = buildMediaAssetApiPath(projectId, assetId);
  const { exp, sig } = createMediaAssetSignedQuery(projectId, assetId);
  return `${path}?exp=${exp}&sig=${sig}`;
}

export function parseMediaAssetApiUrl(
  url: string,
): { projectId: string; assetId: string } | null {
  const normalized = url.trim();
  if (!normalized) return null;

  const match = normalized.match(MEDIA_ASSET_API_RE);
  if (!match) return null;

  const assetId = match[2] ?? '';
  try {
    assertMediaAssetId(assetId);
  } catch {
    return null;
  }

  return {
    projectId: match[1] ?? '',
    assetId,
  };
}
