import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  countWords,
  extractHeadings,
  extractMainText,
  extractMetaDescription,
  parseCompetitorPageHtml,
} from '../../../../packages/shared-core/dist/seo/competitor-page.util.js';

describe('competitor-page.util', () => {
  const sampleHtml = `<!doctype html>
<html>
<head>
  <meta name="description" content="Sample meta description" />
  <title>Sample</title>
</head>
<body>
  <h1>Main Title</h1>
  <p>First paragraph about widgets.</p>
  <h2>Section Two</h2>
  <p>Second paragraph with more detail.</p>
  <script>window.secret = true;</script>
</body>
</html>`;

  it('extracts meta description and headings', () => {
    assert.equal(extractMetaDescription(sampleHtml), 'Sample meta description');
    assert.deepEqual(extractHeadings(sampleHtml), ['Main Title', 'Section Two']);
  });

  it('extracts main text without script content', () => {
    const text = extractMainText(sampleHtml, 500);
    assert.match(text, /Main Title/);
    assert.match(text, /widgets/);
    assert.doesNotMatch(text, /window\.secret/);
    assert.ok(countWords(text) >= 8);
  });

  it('parseCompetitorPageHtml returns structured scrape meta', () => {
    const parsed = parseCompetitorPageHtml(sampleHtml, { maxChars: 500, maxHeadings: 5 });
    assert.equal(parsed.metaDescription, 'Sample meta description');
    assert.deepEqual(parsed.headings, ['Main Title', 'Section Two']);
    assert.ok(parsed.wordCount > 0);
    assert.ok(parsed.excerpt.length > 0);
  });
});
