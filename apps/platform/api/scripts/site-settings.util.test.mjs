/**
 * site-settings 单元测试：Profile 解析、合并与 Prompt 格式化。
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const utilPath = pathToFileURL(
  resolve(apiRoot, 'dist/project-types/seo-factory/constants/site-settings.js'),
).href;
const {
  formatSiteContentProfileForPrompt,
  mergeSiteContentProfile,
  parseSiteContentProfile,
  siteHasWritingProfile,
} = await import(utilPath);

describe('site-settings', () => {
  it('parseSiteContentProfile reads new array fields', () => {
    const profile = parseSiteContentProfile({
      industry: ' Valves ',
      differentiators: [' OEM ', '', 'Fast lead time'],
      forbiddenTerms: ['cheapest', 'No.1'],
    });
    assert.equal(profile?.industry, 'Valves');
    assert.deepEqual(profile?.differentiators, ['OEM', 'Fast lead time']);
    assert.deepEqual(profile?.forbiddenTerms, ['cheapest', 'No.1']);
  });

  it('mergeSiteContentProfile patches strings and arrays', () => {
    const merged = mergeSiteContentProfile(
      { industry: 'Valves', differentiators: ['A'] },
      { productLines: 'Ball valves', differentiators: ['B', 'C'], forbiddenTerms: [] },
    );
    assert.equal(merged?.industry, 'Valves');
    assert.equal(merged?.productLines, 'Ball valves');
    assert.deepEqual(merged?.differentiators, ['B', 'C']);
    assert.equal(merged?.forbiddenTerms, undefined);
  });

  it('formatSiteContentProfileForPrompt includes forbidden terms', () => {
    const text = formatSiteContentProfileForPrompt({
      industry: 'Industrial valves',
      forbiddenTerms: ['cheapest'],
      differentiators: ['ISO factory'],
    });
    assert.match(text, /Forbidden terms/);
    assert.match(text, /cheapest/);
    assert.match(text, /ISO factory/);
  });

  it('siteHasWritingProfile true when only advanced fields set', () => {
    assert.equal(
      siteHasWritingProfile({ contentProfile: { productLines: 'Ball valves' } }),
      true,
    );
  });
});
