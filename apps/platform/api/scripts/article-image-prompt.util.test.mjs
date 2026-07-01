/**
 * SEO 配图 prompt 构建单元测试。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const utilPath = pathToFileURL(
  resolve(apiRoot, 'dist/project-types/seo-factory/modules/illustration/article-image-prompt.util.js'),
).href;
const {
  buildArticleImagePrompt,
  buildVisualSubject,
  extractFirstSectionHint,
  finalizeArticleImagePrompt,
  inferSectionIntent,
  sanitizeSectionForVisual,
} = await import(utilPath);

describe('sanitizeSectionForVisual', () => {
  it('strips SEO question phrasing', () => {
    assert.equal(sanitizeSectionForVisual('What Is a UAV BMS?'), 'UAV BMS');
    assert.equal(sanitizeSectionForVisual('How to Choose CNC Machines'), 'Choose CNC Machines');
    assert.equal(
      sanitizeSectionForVisual('How Does a Drone Battery Management System Work?'),
      'Drone Battery Management System',
    );
  });
});

describe('inferSectionIntent', () => {
  it('maps heading types to shot intent', () => {
    assert.equal(inferSectionIntent('What Is a UAV BMS?'), 'overview');
    assert.equal(
      inferSectionIntent('How Does a Drone Battery Management System Work?'),
      'mechanism',
    );
  });
});

describe('buildVisualSubject', () => {
  it('uses drone overview nouns for intro UAV BMS section', () => {
    const subject = buildVisualSubject('uav bms', 'What Is a UAV BMS?', 'overview');
    assert.match(subject, /quadcopter drone/i);
    assert.match(subject, /battery pack/i);
    assert.doesNotMatch(subject, /\bBMS\b/i);
    assert.doesNotMatch(subject, /\bUAV\b/i);
    assert.doesNotMatch(subject, /What Is/i);
  });

  it('uses PCB close-up nouns for how-it-works section', () => {
    const subject = buildVisualSubject(
      'uav bms',
      'How Does a Drone Battery Management System Work?',
      'mechanism',
    );
    assert.match(subject, /printed circuit board/i);
    assert.match(subject, /battery cells/i);
    assert.doesNotMatch(subject, /\bBMS\b/i);
    assert.doesNotMatch(subject, /quadcopter/i);
  });
});

describe('buildArticleImagePrompt', () => {
  it('overview prompt shows drone plus battery pack', () => {
    const prompt = buildArticleImagePrompt({
      keyword: 'uav bms',
      index: 0,
      sectionHint: 'What Is a UAV BMS?',
    });
    assert.match(prompt, /quadcopter drone/i);
    assert.match(prompt, /battery pack/i);
    assert.match(prompt, /unlabeled bare components/i);
    assert.doesNotMatch(prompt, /What Is a UAV BMS/i);
    assert.doesNotMatch(prompt, /\bBMS\b/i);
    assert.doesNotMatch(prompt, /modern industrial facility/i);
  });

  it('mechanism prompt focuses on cells and circuit board', () => {
    const prompt = buildArticleImagePrompt({
      keyword: 'uav bms',
      index: 0,
      sectionHint: 'How Does a Drone Battery Management System Work?',
    });
    assert.match(prompt, /Macro close-up/i);
    assert.match(prompt, /printed circuit board/i);
    assert.match(prompt, /battery cells/i);
    assert.doesNotMatch(prompt, /\bBMS\b/i);
    assert.doesNotMatch(prompt, /quadcopter/i);
  });
});

describe('finalizeArticleImagePrompt', () => {
  it('appends visual suffix once for manual prompts', () => {
    const once = finalizeArticleImagePrompt('Factory floor scene');
    const twice = finalizeArticleImagePrompt(once);
    assert.equal(once, twice);
    assert.match(once, /signage-free environment/i);
  });
});

describe('extractFirstSectionHint', () => {
  it('reads the first H2 heading', () => {
    const hint = extractFirstSectionHint('# Title\n\n## Monitoring Basics\n\nBody');
    assert.equal(hint, 'Monitoring Basics');
  });
});
