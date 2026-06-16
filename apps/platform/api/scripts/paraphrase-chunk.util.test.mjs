/**
 * 分块润色与本地分回归单元测试。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const chunkPath = pathToFileURL(
  resolve(apiRoot, 'dist/project-types/seo-factory/modules/paraphrase/paraphrase-chunk.util.js'),
).href;
const regressionPath = pathToFileURL(
  resolve(apiRoot, 'dist/project-types/seo-factory/modules/paraphrase/paraphrase-regression.util.js'),
).href;

const {
  countH2Headings,
  joinParaphraseChunks,
  shouldUseChunkedParaphrase,
  splitContentByH2,
} = await import(chunkPath);
const { checkParaphraseLocalScoreRegression } = await import(regressionPath);

describe('paraphrase-chunk.util', () => {
  it('splits markdown by H2 and rejoins', () => {
    const content = [
      'Intro about valves.',
      '',
      '## Section A',
      'Detail A.',
      '',
      '## Section B',
      'Detail B.',
    ].join('\n');

    const chunks = splitContentByH2(content);
    assert.equal(chunks.length, 3);
    assert.equal(chunks[0].isLead, true);
    assert.equal(chunks[1].isLead, false);
    assert.match(chunks[1].content, /^## Section A/);

    const joined = joinParaphraseChunks(chunks);
    assert.match(joined, /Intro about valves/);
    assert.match(joined, /## Section B/);
  });

  it('enables chunked mode only for long multi-H2 articles', () => {
    const short = '## A\n\ntext\n\n## B\n\ntext';
    assert.equal(shouldUseChunkedParaphrase(short), false);
    assert.equal(countH2Headings(short), 2);

    const long = `${'word '.repeat(1200)}\n\n## A\n\ntext\n\n## B\n\ntext\n\n## C\n\ntext`;
    assert.equal(countH2Headings(long), 3);
    assert.equal(shouldUseChunkedParaphrase(long), true);
  });
});

describe('checkParaphraseLocalScoreRegression', () => {
  it('reverts when local score drops beyond threshold', () => {
    const keyword = 'industrial valve';
    const original = [
      '# industrial valve guide',
      '',
      '## industrial valve types',
      'industrial valve applications for plants.',
      '',
      '## Selection tips',
      'Choose an industrial valve by pressure and material.',
      '',
      '## FAQ',
      '- What is an industrial valve?',
      '- How to maintain an industrial valve?',
    ].join('\n');

    const degraded = [
      '# guide',
      '',
      '## types',
      'applications.',
      '',
      '## tips',
      'Choose by pressure.',
    ].join('\n');

    const result = checkParaphraseLocalScoreRegression({
      keyword,
      originalContent: original,
      paraphrasedContent: degraded,
      targetWordCount: 800,
      maxDrop: 0,
    });

    assert.equal(result.revert, true);
    assert.ok(result.drop > 0);
    assert.match(result.reason ?? '', /本地预检分下降/);
  });
});
