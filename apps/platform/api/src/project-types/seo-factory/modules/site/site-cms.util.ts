/**
 * 站点 CMS 配置解析与 API 脱敏（WordPress + Shopify）。
 *
 * 边界：
 * - 不负责：HTTP 发布（CmsPublishService）
 *
 * 敏感字段（accessToken / applicationPassword）入库前经 secret-cipher 加密。
 */

import {
  decryptSecret,
  encryptSecret,
  isEncryptedSecret,
} from '../../../../core/crypto/secret-cipher.util';

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

const WORDPRESS_SECRET_FIELD = 'applicationPassword';
const SHOPIFY_SECRET_FIELD = 'accessToken';

function readCmsSecretField(raw: Record<string, unknown>, field: string): string {
  const stored = typeof raw[field] === 'string' ? raw[field].trim() : '';
  if (!stored) {
    return '';
  }
  return decryptSecret(stored);
}

function hasCmsSecretField(raw: Record<string, unknown>, field: string): boolean {
  const stored = typeof raw[field] === 'string' ? raw[field].trim() : '';
  return Boolean(stored);
}

/** 将 CMS 配置中的明文密钥加密后写入数据库 */
export function encryptCmsConfigForStorage(
  cmsType: string,
  cmsConfig: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...cmsConfig };

  if (cmsType === 'wordpress') {
    const plain = readCmsSecretField(out, WORDPRESS_SECRET_FIELD);
    if (plain && !isEncryptedSecret(typeof out[WORDPRESS_SECRET_FIELD] === 'string' ? out[WORDPRESS_SECRET_FIELD] : '')) {
      out[WORDPRESS_SECRET_FIELD] = encryptSecret(plain);
    }
  }

  if (cmsType === 'shopify') {
    const plain = readCmsSecretField(out, SHOPIFY_SECRET_FIELD);
    if (plain && !isEncryptedSecret(typeof out[SHOPIFY_SECRET_FIELD] === 'string' ? out[SHOPIFY_SECRET_FIELD] : '')) {
      out[SHOPIFY_SECRET_FIELD] = encryptSecret(plain);
    }
  }

  return out;
}

/** 迁移脚本：加密 Site.cmsConfig 中的明文密钥 */
export function encryptStoredCmsConfig(
  cmsType: string | null | undefined,
  cmsConfig: unknown,
): Record<string, unknown> | null {
  if (!cmsType || !cmsConfig || typeof cmsConfig !== 'object') {
    return null;
  }
  return encryptCmsConfigForStorage(cmsType, cmsConfig as Record<string, unknown>);
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
  const applicationPassword = readCmsSecretField(raw, WORDPRESS_SECRET_FIELD);

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
  const accessToken = readCmsSecretField(raw, SHOPIFY_SECRET_FIELD);
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
        hasAccessToken: hasCmsSecretField(parsed, SHOPIFY_SECRET_FIELD),
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
      hasApplicationPassword: hasCmsSecretField(parsed, WORDPRESS_SECRET_FIELD),
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
