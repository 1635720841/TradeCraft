/**
 * site-utm-defaults 单元测试。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const utilPath = pathToFileURL(
  resolve(apiRoot, 'dist/project-types/seo-factory/constants/site-utm-defaults.util.js'),
).href;
const {
  DEFAULT_SITE_UTM_MEDIUM,
  DEFAULT_SITE_UTM_SOURCE,
  domainToUtmCampaign,
  resolveSiteUtmDefaults,
  withDefaultSiteUtmProfile,
} = await import(utilPath);

describe('site-utm-defaults.util', () => {
  it('domainToUtmCampaign strips protocol and www', () => {
    assert.equal(domainToUtmCampaign('https://www.ayaauavpower.com/'), 'ayaauavpower-com');
    assert.equal(domainToUtmCampaign('Example.COM'), 'example-com');
  });

  it('resolveSiteUtmDefaults uses fixed source and medium', () => {
    assert.deepEqual(resolveSiteUtmDefaults('www.example.com'), {
      utmSource: DEFAULT_SITE_UTM_SOURCE,
      utmMedium: DEFAULT_SITE_UTM_MEDIUM,
      utmCampaign: 'example-com',
    });
  });

  it('withDefaultSiteUtmProfile keeps explicit values', () => {
    const profile = withDefaultSiteUtmProfile('example.com', {
      utmSource: 'custom',
      utmCampaign: 'spring',
    });
    assert.equal(profile.utmSource, 'custom');
    assert.equal(profile.utmMedium, DEFAULT_SITE_UTM_MEDIUM);
    assert.equal(profile.utmCampaign, 'spring');
  });
});
