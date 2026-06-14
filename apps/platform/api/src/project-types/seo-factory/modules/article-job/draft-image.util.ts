/**
 * 稿件正文插图：存储 key、API 路径、签名 URL。
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { DRAFT_IMAGE_SIG_TTL_MS } from '../../constants/draft-image';

const DRAFT_IMAGE_FILENAME_RE = /^[0-9a-f-]{36}\.(jpe?g|png|webp|gif)$/i;
const DRAFT_IMAGE_API_RE =
  /\/api\/v1\/projects\/([^/]+)\/article-jobs\/([^/]+)\/draft\/images\/([^/?#]+)/i;

export function buildDraftImageStorageKey(
  organizationId: string,
  projectId: string,
  jobId: string,
  filename: string,
): string {
  return `${organizationId}/${projectId}/${jobId}/draft-images/${filename}`;
}

export function buildDraftImageApiPath(
  projectId: string,
  jobId: string,
  filename: string,
): string {
  return `/api/v1/projects/${projectId}/article-jobs/${jobId}/draft/images/${filename}`;
}

export function assertDraftImageFilename(filename: string): void {
  if (!DRAFT_IMAGE_FILENAME_RE.test(filename)) {
    throw new Error('invalid draft image filename');
  }
}

export function extensionForDraftImageMime(mime: string): string {
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

function draftImageSignSecret(): string {
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
  return createHmac('sha256', draftImageSignSecret()).update(payload).digest('hex');
}

export function createDraftImageSignedQuery(
  projectId: string,
  jobId: string,
  filename: string,
  nowMs = Date.now(),
): { exp: number; sig: string } {
  const exp = nowMs + DRAFT_IMAGE_SIG_TTL_MS;
  const sig = signPayload(`${projectId}:${jobId}:${filename}:${exp}`);
  return { exp, sig };
}

export function verifyDraftImageSignedQuery(
  projectId: string,
  jobId: string,
  filename: string,
  expRaw: string | undefined,
  sigRaw: string | undefined,
  nowMs = Date.now(),
): boolean {
  if (!expRaw || !sigRaw) return false;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp <= nowMs) return false;

  try {
    assertDraftImageFilename(filename);
  } catch {
    return false;
  }

  const expected = signPayload(`${projectId}:${jobId}:${filename}:${exp}`);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(sigRaw, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function buildDraftImagePublicUrl(
  projectId: string,
  jobId: string,
  filename: string,
): string {
  const path = buildDraftImageApiPath(projectId, jobId, filename);
  const { exp, sig } = createDraftImageSignedQuery(projectId, jobId, filename);
  return `${path}?exp=${exp}&sig=${sig}`;
}

export function parseDraftImageApiUrl(
  url: string,
): { projectId: string; jobId: string; filename: string } | null {
  const normalized = url.trim();
  if (!normalized) return null;

  const match = normalized.match(DRAFT_IMAGE_API_RE);
  if (!match) return null;

  const filename = match[3] ?? '';
  try {
    assertDraftImageFilename(filename);
  } catch {
    return null;
  }

  return {
    projectId: match[1] ?? '',
    jobId: match[2] ?? '',
    filename,
  };
}
