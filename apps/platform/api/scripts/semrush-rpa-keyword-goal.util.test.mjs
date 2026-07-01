import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  collectSemrushKeywordList,
  isSemrushKeywordGoalSatisfied,
  semrushPrimaryKeywordKeys,
} from '../dist/project-types/seo-factory/providers/semrush/semrush-rpa-keyword-goal.util.js';

function noopLogger() {
  return { info: () => {}, warn: () => {} };
}

function createPageWithTags(tagTexts) {
  return {
    evaluate: async () => tagTexts,
  };
}

describe('semrush-rpa-keyword-goal.util', () => {
  it('collectSemrushKeywordList keeps sanitized primary and recommended keywords', () => {
    const keywords = collectSemrushKeywordList(
      'best running shoes',
      ['running shoes guide', ''],
      noopLogger(),
    );
    assert.ok(keywords.includes('best running shoes'));
    assert.ok(keywords.includes('running shoes guide'));
  });

  it('semrushPrimaryKeywordKeys splits comma-separated primaries', () => {
    const keys = semrushPrimaryKeywordKeys('Foo, BAR，baz');
    assert.equal(keys.size, 3);
    assert.ok(keys.has('foo'));
    assert.ok(keys.has('bar'));
    assert.ok(keys.has('baz'));
  });

  it('isSemrushKeywordGoalSatisfied requires exact normalized tag match', async () => {
    const page = createPageWithTags(['Best Running Shoes', 'Running Shoes Guide']);
    const satisfied = await isSemrushKeywordGoalSatisfied(page, [
      'best running shoes',
      'running shoes guide',
    ]);
    assert.equal(satisfied, true);
  });

  it('isSemrushKeywordGoalSatisfied rejects partial or extra tags', async () => {
    const page = createPageWithTags(['best running shoes']);
    assert.equal(await isSemrushKeywordGoalSatisfied(page, ['best running shoes', 'guide']), false);

    const extra = createPageWithTags(['best running shoes', 'running shoes guide', 'extra']);
    assert.equal(
      await isSemrushKeywordGoalSatisfied(extra, ['best running shoes', 'running shoes guide']),
      false,
    );
  });
});
