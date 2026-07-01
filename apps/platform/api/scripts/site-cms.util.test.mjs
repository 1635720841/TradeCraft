/**
 * site-cms.util 单元测试：CMS 凭证加密与解析。
 */
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const utilPath = pathToFileURL(
  resolve(apiRoot, 'dist/project-types/seo-factory/modules/site/site-cms.util.js'),
).href;
const cipherPath = pathToFileURL(resolve(apiRoot, 'dist/core/crypto/secret-cipher.util.js')).href;

const {
  encryptCmsConfigForStorage,
  parseShopifyCmsConfig,
  parseWordPressCmsConfig,
  sanitizeCmsForResponse,
  mergeShopifyCmsConfig,
} = await import(utilPath);
const { isEncryptedSecret } = await import(cipherPath);

describe('site-cms.util', () => {
  const prevJwt = process.env.AUTH_JWT_SECRET;

  before(() => {
    process.env.AUTH_JWT_SECRET = 'test-cms-cipher-secret';
    delete process.env.SECRET_CIPHER_KEY;
  });

  after(() => {
    if (prevJwt === undefined) delete process.env.AUTH_JWT_SECRET;
    else process.env.AUTH_JWT_SECRET = prevJwt;
  });

  it('encryptCmsConfigForStorage encrypts Shopify accessToken', () => {
    const stored = encryptCmsConfigForStorage('shopify', {
      shopDomain: 'demo.myshopify.com',
      accessToken: 'shpat_plain_token_1234567890',
      blogId: '1',
    });
    assert.ok(isEncryptedSecret(stored.accessToken));
    const parsed = parseShopifyCmsConfig('shopify', stored);
    assert.equal(parsed?.accessToken, 'shpat_plain_token_1234567890');
  });

  it('encryptCmsConfigForStorage encrypts WordPress applicationPassword', () => {
    const stored = encryptCmsConfigForStorage('wordpress', {
      baseUrl: 'https://example.com',
      username: 'admin',
      applicationPassword: 'wp-app-password',
    });
    assert.ok(isEncryptedSecret(stored.applicationPassword));
    const parsed = parseWordPressCmsConfig('wordpress', stored);
    assert.equal(parsed?.applicationPassword, 'wp-app-password');
  });

  it('sanitizeCmsForResponse never exposes secrets', () => {
    const stored = encryptCmsConfigForStorage('shopify', {
      shopDomain: 'demo.myshopify.com',
      accessToken: 'shpat_plain_token_1234567890',
      blogId: '1',
    });
    const sanitized = sanitizeCmsForResponse('shopify', stored);
    assert.equal(sanitized.cmsConfig?.hasAccessToken, true);
    assert.equal('accessToken' in (sanitized.cmsConfig ?? {}), false);
  });

  it('mergeShopifyCmsConfig preserves existing decrypted token', () => {
    const stored = encryptCmsConfigForStorage('shopify', {
      shopDomain: 'demo.myshopify.com',
      accessToken: 'shpat_existing_token_123456789',
      blogId: '1',
      publishTarget: 'blog',
    });
    const existing = parseShopifyCmsConfig('shopify', stored);
    const merged = mergeShopifyCmsConfig(
      { shopDomain: 'demo.myshopify.com', blogId: '2' },
      existing,
    );
    assert.equal(merged.accessToken, 'shpat_existing_token_123456789');
    assert.equal(merged.blogId, '2');
  });
});
