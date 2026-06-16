/**
 * 站点 CMS 配置解析与 API 脱敏（WordPress + Shopify）。
 *
 * 边界：
 * - 不负责：HTTP 发布（CmsPublishService）
 */

export type CmsType = 'wordpress' | 'shopify';

export type WordPressPostStatus = 'draft' | 'publish';
export type CmsPublishStatus = WordPressPostStatus;

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

export type ShopifyPublishTarget = 'blog' | 'product';

export interface ShopifyCmsConfig {
  shopDomain: string;
  accessToken: string;
  blogId: string;
  productId?: string;
  publishTarget?: ShopifyPublishTarget;
  defaultPublished?: boolean;
}

export interface ShopifyCmsConfigInput {
  shopDomain: string;
  accessToken?: string;
  blogId?: string;
  productId?: string;
  publishTarget?: ShopifyPublishTarget;
  defaultPublished?: boolean;
}

export interface SanitizedWordPressCmsConfig {
  baseUrl: string;
  username: string;
  defaultStatus: WordPressPostStatus;
  hasApplicationPassword: boolean;
}

export interface SanitizedShopifyCmsConfig {
  shopDomain: string;
  blogId: string;
  productId: string;
  publishTarget: ShopifyPublishTarget;
  defaultPublished: boolean;
  hasAccessToken: boolean;
}

export type SanitizedCmsConfig = SanitizedWordPressCmsConfig | SanitizedShopifyCmsConfig;

export function normalizeShopifyDomain(input: string): string {
  let value = input.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  if (!value.includes('.')) {
    value = `${value}.myshopify.com`;
  }
  return value.toLowerCase();
}

export function getShopifyApiVersion(): string {
  return process.env.SHOPIFY_API_VERSION?.trim() || '2024-10';
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

export function parseShopifyCmsConfig(
  cmsType: string | null | undefined,
  cmsConfig: unknown,
): ShopifyCmsConfig | null {
  if (cmsType !== 'shopify' || !cmsConfig || typeof cmsConfig !== 'object') {
    return null;
  }

  const raw = cmsConfig as Record<string, unknown>;
  const shopDomain =
    typeof raw.shopDomain === 'string' ? normalizeShopifyDomain(raw.shopDomain) : '';
  const accessToken = typeof raw.accessToken === 'string' ? raw.accessToken.trim() : '';
  const blogId = typeof raw.blogId === 'string' ? raw.blogId.trim() : '';
  const productId = typeof raw.productId === 'string' ? raw.productId.trim() : '';
  const publishTarget: ShopifyPublishTarget =
    raw.publishTarget === 'product' ? 'product' : 'blog';

  if (!shopDomain || !accessToken) {
    return null;
  }

  if (publishTarget === 'product') {
    if (!productId) return null;
  } else if (!blogId) {
    return null;
  }

  return {
    shopDomain,
    accessToken,
    blogId,
    productId: productId || undefined,
    publishTarget,
    defaultPublished: raw.defaultPublished === true,
  };
}

export function sanitizeCmsForResponse(
  cmsType: string | null | undefined,
  cmsConfig: unknown,
): { cmsType: string | null; cmsConfig: SanitizedCmsConfig | null } {
  if (cmsType === 'shopify') {
    const parsed = cmsConfig as Record<string, unknown> | null;
    if (!parsed) {
      return { cmsType: 'shopify', cmsConfig: null };
    }

    return {
      cmsType: 'shopify',
      cmsConfig: {
        shopDomain:
          typeof parsed.shopDomain === 'string'
            ? normalizeShopifyDomain(parsed.shopDomain)
            : '',
        blogId: typeof parsed.blogId === 'string' ? parsed.blogId : '',
        productId: typeof parsed.productId === 'string' ? parsed.productId : '',
        publishTarget: parsed.publishTarget === 'product' ? 'product' : 'blog',
        defaultPublished: parsed.defaultPublished === true,
        hasAccessToken: Boolean(
          typeof parsed.accessToken === 'string' && parsed.accessToken.trim(),
        ),
      },
    };
  }

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

export function mergeShopifyCmsConfig(
  input: ShopifyCmsConfigInput,
  existing: ShopifyCmsConfig | null,
): ShopifyCmsConfig {
  const accessToken = input.accessToken?.trim() || existing?.accessToken || '';

  if (!accessToken) {
    throw new Error('Shopify Admin API Access Token 不能为空');
  }

  return {
    shopDomain: normalizeShopifyDomain(input.shopDomain),
    accessToken,
    blogId: input.blogId?.trim() ?? existing?.blogId ?? '',
    productId: input.productId?.trim() || existing?.productId,
    publishTarget:
      input.publishTarget === 'product' || input.publishTarget === 'blog'
        ? input.publishTarget
        : (existing?.publishTarget ?? 'blog'),
    defaultPublished: input.defaultPublished ?? existing?.defaultPublished ?? false,
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
