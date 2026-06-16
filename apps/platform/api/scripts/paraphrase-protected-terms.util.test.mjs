/**
 * QuillBot 保护词提取单元测试。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const utilPath = pathToFileURL(
  resolve(apiRoot, 'dist/project-types/seo-factory/modules/paraphrase/paraphrase-protected-terms.util.js'),
).href;
const { buildParaphraseProtectedTerms } = await import(utilPath);

describe('buildParaphraseProtectedTerms', () => {
  it('merges brief entities, semrush keywords, site profile and content specs', () => {
    const terms = buildParaphraseProtectedTerms({
      targetKeyword: 'ball valve',
      briefData: {
        recommendedEntities: ['CAN Bus'],
        outline: { recommendedKeywords: ['stainless steel valve'] },
      },
      seoCheckData: {
        semrush: { submittedKeywords: ['ball valve', 'RS485'] },
      },
      siteSettings: {
        contentProfile: { certifications: 'CE, ISO 9001' },
      },
      originalContent: 'Model XYZ-2000 supports 10 bar and FOB pricing.',
    });

    assert.ok(terms.includes('CAN Bus'));
    assert.ok(terms.includes('stainless steel valve'));
    assert.ok(terms.includes('RS485'));
    assert.ok(terms.includes('CE'));
    assert.ok(terms.includes('XYZ-2000'));
    assert.ok(terms.includes('10 bar'));
    assert.ok(terms.includes('FOB'));
    assert.equal(terms.includes('ball valve'), false);
  });
});
