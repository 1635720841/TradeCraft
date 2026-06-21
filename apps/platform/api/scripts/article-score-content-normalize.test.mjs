/**
 * article-score-content 单元测试。
 *
 * 运行：node apps/platform/api/scripts/article-score-content-normalize.test.mjs
 */

import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const utilPath = pathToFileURL(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../../packages/shared-core/dist/seo/article-score-content.util.js',
  ),
).href;

const { looksLikeHtmlArticleContent, normalizeArticleScoreContent, parseTargetKeywordsInput, resolveArticleScoreKeywordList, normalizeContentHeadingsForScore, countSemanticSectionHeadings } = await import(utilPath);

const html =
  '<h1>Magnesium for Sleep</h1><p><strong>Magnesium</strong> helps you relax.</p><p>Second paragraph here.</p>';

assert.equal(looksLikeHtmlArticleContent(html), true);

const normalized = normalizeArticleScoreContent(html);
assert.match(normalized, /Magnesium for Sleep/);
assert.match(normalized, /helps you relax/);
assert.doesNotMatch(normalized, /<p>/);

assert.equal(normalizeArticleScoreContent('# Already markdown\n\nBody'), '# Already markdown\n\nBody');

assert.deepEqual(parseTargetKeywordsInput('a, b\nc'), ['a', 'b', 'c']);
assert.deepEqual(parseTargetKeywordsInput('teeth cleaning in soho, dental cleaning in soho'), [
  'teeth cleaning in soho',
  'dental cleaning in soho',
]);
assert.deepEqual(
  resolveArticleScoreKeywordList({
    targetKeyword: 'teeth cleaning in soho, dental cleaning in soho',
  }).keywordList,
  ['teeth cleaning in soho', 'dental cleaning in soho'],
);

const plain = `Hair Transplant Training: A Complete Hair Transplant Course

A complete hair transplant course should teach physicians.

Key Takeaways

Strong training should cover FUE and FUT.

Module 1: Foundations of Hair Restoration

Module 2: Patient Consultation`;

const plainNormalized = normalizeContentHeadingsForScore(plain);
assert.match(plainNormalized, /^# Hair Transplant Training/m);
assert.match(plainNormalized, /## Module 1: Foundations/m);
assert.equal(countSemanticSectionHeadings(plain), 4);

const bloatedHtml =
  '<h1>Laser Gum in SoHo</h1><p>' +
  Array.from(
    { length: 2500 },
    (_, i) =>
      `<span class="swa-highlight swa-kw-${i}" style="background-color: rgb(230, 215, 255); font-family: Arial;">word${i}</span> `,
  ).join('') +
  '</p>';
assert.ok(bloatedHtml.length > 100_000, `fixture length ${bloatedHtml.length}`);
const bloatedNormalized = normalizeArticleScoreContent(bloatedHtml);
assert.ok(
  bloatedNormalized.length < bloatedHtml.length / 10,
  `bloated HTML should shrink sharply, ${bloatedHtml.length} -> ${bloatedNormalized.length}`,
);

console.log('article-score-content-normalize.test.mjs: ok');
