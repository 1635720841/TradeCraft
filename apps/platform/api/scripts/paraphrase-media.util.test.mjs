/**
 * 润色媒体屏蔽/恢复单元测试。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const utilPath = pathToFileURL(
  resolve(apiRoot, 'dist/project-types/seo-factory/modules/paraphrase/paraphrase-media.util.js'),
).href;

const {
  extractMarkdownMediaExpressions,
  finalizeParaphraseMediaContent,
  normalizeBrokenMarkdownUrls,
  resolveParaphraseChunkSkip,
  restoreParaphraseMarkdownMedia,
  shieldParaphraseMedia,
  syncAllMediaFromOriginal,
  unshieldParaphraseMedia,
} = await import(utilPath);

const LONG_BFL_URL =
  'https://delivery.eu2.bfl.ai/durable/2026070103/ef746010/sample.jpeg?se=2026-07-01T03%3A36%3A29Z&sig=abc';

describe('paraphrase-media.util', () => {
  it('shields and unshields image markdown', () => {
    const original = `## Section\n\n![diagram](${LONG_BFL_URL})\n\nBody text.`;
    const { content: shielded, tokens } = shieldParaphraseMedia(original);

    assert.match(shielded, /⟦MEDIA:0⟧/);
    assert.equal(tokens.length, 1);
    assert.ok(tokens[0].includes(LONG_BFL_URL));

    const restored = unshieldParaphraseMedia(shielded, tokens);
    assert.equal(restored, original);
  });

  it('normalizes broken multiline image URLs', () => {
    const broken = `![diagram](https://delivery.eu2.bfl.ai/durable/2026070103/ef746010/sample.jpeg?se=2026-07-01T03%3A36%3A29Z\n&sig=abc)`;
    const fixed = normalizeBrokenMarkdownUrls(broken);
    assert.ok(!fixed.includes('\n'));
    assert.match(fixed, /sig=abc\)/);
  });

  it('restores missing image when LLM dropped placeholder', () => {
    const original = `## Flight time\n\n![uav bms](${LONG_BFL_URL})\n\nFlight time depends on BMS.`;
    const paraphrased = '## Flight time\n\nFlight duration depends on the battery management system.';
    const restored = restoreParaphraseMarkdownMedia(original, paraphrased);

    assert.ok(restored.includes(LONG_BFL_URL));
    assert.match(restored, /Flight duration depends/);
  });

  it('finalizeParaphraseMediaContent restores tokens after LLM edit', () => {
    const original = `## Section\n\n![diagram](${LONG_BFL_URL})\n\nOriginal prose here.`;
    const { content: shielded, tokens } = shieldParaphraseMedia(original);
    const llmOutput = shielded.replace('Original prose here.', 'Polished prose here.');
    const restored = finalizeParaphraseMediaContent(original, llmOutput, tokens);

    assert.ok(restored.includes(LONG_BFL_URL));
    assert.match(restored, /Polished prose here/);
  });

  it('extracts link and image expressions', () => {
    const content = 'See [catalog](/catalog) and ![img](/img.png).';
    const expressions = extractMarkdownMediaExpressions(content);
    assert.equal(expressions.length, 2);
    assert.ok(expressions.some((item) => item.includes('/catalog')));
    assert.ok(expressions.some((item) => item.includes('/img.png')));
  });

  it('syncAllMediaFromOriginal replaces corrupted image markdown', () => {
    const original = `## Flight time\n\n![uav bms](${LONG_BFL_URL})\n\nFlight time depends on BMS.`;
    const corrupted = `## Flight time\n\n![uav bms](${LONG_BFL_URL.replace('sig=abc', 'sig= ab c')})\n\nFlight duration depends on BMS.`;
    const synced = syncAllMediaFromOriginal(original, corrupted);

    assert.ok(synced.includes(LONG_BFL_URL));
    assert.doesNotMatch(synced, /sig=\s+ab\s+c/);
  });

  it('skips chunks that are mostly media', () => {
    const content = `## Gallery\n\n![a](/a.png)\n\n![b](/b.png)`;
    assert.equal(resolveParaphraseChunkSkip(content), 'minimal_prose');

    const prose =
      '## Guide\n\nThis section explains UAV BMS selection criteria, voltage balancing, and procurement considerations in detail for industrial drone fleet operators and buyers with clear engineering tradeoffs.';
    assert.equal(resolveParaphraseChunkSkip(prose), 'short_prose');

    const longClean = `## Guide\n\n${'Engineering '.repeat(40)}UAV BMS selection criteria for fleet buyers.`;
    assert.equal(resolveParaphraseChunkSkip(longClean), 'no_ai_cliches');
  });
});
