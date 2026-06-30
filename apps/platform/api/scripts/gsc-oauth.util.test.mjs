/**
 * gsc-oauth.util 单元测试。
 */

import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const utilPath = pathToFileURL(
  resolve(apiRoot, 'dist/project-types/seo-factory/modules/gsc/gsc-oauth.util.js'),
).href;
const { matchGscPropertyUrl, propertyMatchesSiteDomain, normalizeDomain, normalizePageUrlForMatch, pageUrlsMatchForGsc, signGscOAuthState, verifyGscOAuthState } =
  await import(utilPath);

describe('gsc-oauth.util', () => {
  const prevSecret = process.env.AUTH_JWT_SECRET;

  before(() => {
    process.env.AUTH_JWT_SECRET = 'test-gsc-oauth-state-secret';
  });

  after(() => {
    if (prevSecret === undefined) delete process.env.AUTH_JWT_SECRET;
    else process.env.AUTH_JWT_SECRET = prevSecret;
  });
  it('normalizeDomain strips protocol and www', () => {
    assert.equal(normalizeDomain('https://www.Example.com/'), 'example.com');
    assert.equal(normalizeDomain('sc-domain:Example.com'), 'example.com');
  });

  it('filterUsableGscPropertyEntries keeps owner and full user only', async () => {
    const mod = await import(utilPath);
    const urls = mod.filterUsableGscPropertyEntries([
      { siteUrl: 'sc-domain:example.com', permissionLevel: 'siteRestrictedUser' },
      { siteUrl: 'https://www.example.com/', permissionLevel: 'siteFullUser' },
      { siteUrl: 'sc-domain:other.com', permissionLevel: 'siteOwner' },
    ]);
    assert.deepEqual(urls, ['https://www.example.com/', 'sc-domain:other.com']);
  });

  it('formatGscUserError translates insufficient permission', async () => {
    const mod = await import(utilPath);
    const msg = mod.formatGscUserError(
      "User does not have sufficient permission for site 'sc-domain:ayaauavpower.com'.",
    );
    assert.match(msg, /权限不足/);
  });

  it('matchGscPropertyUrl prefers https URL-prefix over sc-domain', () => {
    const url = matchGscPropertyUrl('www.ayaauavpower.com', [
      'sc-domain:ayaauavpower.com',
      'https://www.ayaauavpower.com/',
    ]);
    assert.equal(url, 'https://www.ayaauavpower.com/');
  });

  it('matchGscPropertyUrl uses sc-domain when no https property', () => {
    const url = matchGscPropertyUrl('example.com', ['sc-domain:example.com']);
    assert.equal(url, 'sc-domain:example.com');
  });

  it('matchGscPropertyUrl prefers https when both sc-domain and https exist', () => {
    const url = matchGscPropertyUrl('example.com', [
      'https://example.com/',
      'sc-domain:example.com',
    ]);
    assert.equal(url, 'https://example.com/');
  });

  it('matchGscPropertyUrl matches https property', () => {
    const url = matchGscPropertyUrl('www.example.com', ['https://www.example.com/']);
    assert.equal(url, 'https://www.example.com/');
  });

  it('matchGscPropertyUrl returns null when no domain match', () => {
    const url = matchGscPropertyUrl('www.ayaauavpower.com', ['sc-domain:example.com']);
    assert.equal(url, null);
  });

  it('propertyMatchesSiteDomain rejects cross-domain binding', () => {
    assert.equal(propertyMatchesSiteDomain('sc-domain:example.com', 'www.ayaauavpower.com'), false);
    assert.equal(propertyMatchesSiteDomain('sc-domain:ayaauavpower.com', 'www.ayaauavpower.com'), true);
  });

  it('pageUrlsMatchForGsc matches GSC page to CMS post URL', () => {
    assert.equal(
      normalizePageUrlForMatch('https://www.example.com/blog/valve-guide/'),
      'example.com/blog/valve-guide',
    );
    assert.equal(
      pageUrlsMatchForGsc(
        'https://example.com/blog/valve-guide',
        'https://www.example.com/blog/valve-guide/',
      ),
      true,
    );
    assert.equal(
      pageUrlsMatchForGsc('https://example.com/other', 'https://example.com/blog/valve-guide'),
      false,
    );
  });

  it('signGscOAuthState and verifyGscOAuthState round-trip platform mode', () => {
    const state = signGscOAuthState({
      mode: 'platform',
      connectedByUserId: 'user-1',
      exp: Date.now() + 60_000,
    });
    const payload = verifyGscOAuthState(state);
    assert.equal(payload?.mode, 'platform');
    assert.equal(payload?.connectedByUserId, 'user-1');
  });

  it('verifyGscOAuthState rejects expired state', () => {
    const state = signGscOAuthState({ mode: 'platform', exp: Date.now() - 1000 });
    assert.equal(verifyGscOAuthState(state), null);
  });

  it('verifyGscOAuthState rejects tampered signature', () => {
    const state = signGscOAuthState({ mode: 'platform', exp: Date.now() + 60_000 });
    assert.equal(verifyGscOAuthState(`${state}x`), null);
  });

  it('propertyMatchesSiteDomain allows subdomain sibling match', () => {
    assert.equal(propertyMatchesSiteDomain('https://blog.example.com', 'example.com'), true);
  });
});
