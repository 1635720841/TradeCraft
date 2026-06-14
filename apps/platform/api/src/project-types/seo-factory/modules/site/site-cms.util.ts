/**
 * 站点 CMS 配置解析与 API 脱敏。
 *
 * 边界：
 * - 不负责：WordPress HTTP 调用（CmsPublishService）
 */

export type WordPressPostStatus = 'draft' | 'publish';

export interface WordPressCmsConfig {
  baseUrl: string;
  username: string;
  applicationPassword: string;
  defaultStatus?: WordPressPostStatus;
}

export interface WordPressCmsConfigInput {
  baseUrl: string;
  username: string;
  applicationPassword?: string;
  defaultStatus?: WordPressPostStatus;
}

export interface SanitizedCmsConfig {
  baseUrl: string;
  username: string;
  defaultStatus: WordPressPostStatus;
  hasApplicationPassword: boolean;
}

export function parseWordPressCmsConfig(
  cmsType: string | null | undefined,
  cmsConfig: unknown,
): WordPressCmsConfig | null {
  if (cmsType !== 'wordpress' || !cmsConfig || typeof cmsConfig !== 'object') {
    return null;
  }

  const raw = cmsConfig as Record<string, unknown>;
  const baseUrl = typeof raw.baseUrl === 'string' ? raw.baseUrl.trim().replace(/\/+$/, '') : '';
  const username = typeof raw.username === 'string' ? raw.username.trim() : '';
  const applicationPassword =
    typeof raw.applicationPassword === 'string' ? raw.applicationPassword.trim() : '';

  if (!baseUrl || !username || !applicationPassword) {
    return null;
  }

  const defaultStatus = raw.defaultStatus === 'publish' ? 'publish' : 'draft';

  return { baseUrl, username, applicationPassword, defaultStatus };
}

export function sanitizeCmsForResponse(
  cmsType: string | null | undefined,
  cmsConfig: unknown,
): { cmsType: string | null; cmsConfig: SanitizedCmsConfig | null } {
  if (cmsType !== 'wordpress') {
    return { cmsType: cmsType ?? null, cmsConfig: null };
  }

  const parsed = cmsConfig as Record<string, unknown> | null;
  if (!parsed) {
    return { cmsType: 'wordpress', cmsConfig: null };
  }

  return {
    cmsType: 'wordpress',
    cmsConfig: {
      baseUrl: typeof parsed.baseUrl === 'string' ? parsed.baseUrl : '',
      username: typeof parsed.username === 'string' ? parsed.username : '',
      defaultStatus: parsed.defaultStatus === 'publish' ? 'publish' : 'draft',
      hasApplicationPassword: Boolean(
        typeof parsed.applicationPassword === 'string' && parsed.applicationPassword.trim(),
      ),
    },
  };
}

export function mergeWordPressCmsConfig(
  input: WordPressCmsConfigInput,
  existing: WordPressCmsConfig | null,
): WordPressCmsConfig {
  const applicationPassword =
    input.applicationPassword?.trim() || existing?.applicationPassword || '';

  if (!applicationPassword) {
    throw new Error('WordPress Application Password 不能为空');
  }

  return {
    baseUrl: input.baseUrl.trim().replace(/\/+$/, ''),
    username: input.username.trim(),
    applicationPassword,
    defaultStatus: input.defaultStatus === 'publish' ? 'publish' : 'draft',
  };
}
