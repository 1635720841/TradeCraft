/**
 * Brief 人工确认状态单元测试。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const utilPath = pathToFileURL(
  resolve(apiRoot, 'dist/project-types/seo-factory/constants/brief-approval.js'),
).href;
const {
  isBriefApprovalPending,
  isBriefApprovedOrSkipped,
  parseSiteWorkflowSettings,
  withBriefApproval,
} = await import(utilPath);

describe('isBriefApprovalPending', () => {
  it('returns true only when approvalStatus is pending', () => {
    assert.equal(isBriefApprovalPending({ approvalStatus: 'pending' }), true);
    assert.equal(isBriefApprovalPending({ approvalStatus: 'approved' }), false);
    assert.equal(isBriefApprovalPending(null), false);
  });
});

describe('isBriefApprovedOrSkipped', () => {
  it('accepts approved or skipped', () => {
    assert.equal(isBriefApprovedOrSkipped({ approvalStatus: 'approved' }), true);
    assert.equal(isBriefApprovedOrSkipped({ approvalStatus: 'skipped' }), true);
    assert.equal(isBriefApprovedOrSkipped({ approvalStatus: 'pending' }), false);
  });
});

describe('parseSiteWorkflowSettings', () => {
  it('reads requireBriefApproval flag', () => {
    assert.deepEqual(parseSiteWorkflowSettings({ requireBriefApproval: true }), {
      requireBriefApproval: true,
      enableParaphrase: true,
      enableIllustration: true,
    });
    assert.deepEqual(parseSiteWorkflowSettings({}), {
      requireBriefApproval: false,
      enableParaphrase: true,
      enableIllustration: true,
    });
    assert.deepEqual(parseSiteWorkflowSettings({ enableParaphrase: false }), {
      requireBriefApproval: false,
      enableParaphrase: false,
      enableIllustration: true,
    });
    assert.deepEqual(parseSiteWorkflowSettings({ enableIllustration: false }), {
      requireBriefApproval: false,
      enableParaphrase: true,
      enableIllustration: false,
    });
  });
});

describe('withBriefApproval', () => {
  it('merges approval metadata into briefData', () => {
    const next = withBriefApproval({ outline: { title: 'A' } }, {
      approvalStatus: 'approved',
      approvedAt: '2026-06-14T00:00:00.000Z',
    });
    assert.equal(next.approvalStatus, 'approved');
    assert.equal(next.outline.title, 'A');
  });

  it('preserves faqCandidates and featuredSnippetTarget in outline', () => {
    const outline = {
      title: 'Valve Guide',
      faqCandidates: ['What is a ball valve?', 'How to choose?'],
      featuredSnippetTarget: { heading: 'What is a ball valve?', answerMaxWords: 50 },
    };
    const next = withBriefApproval({ outline }, { approvalStatus: 'pending' });
    assert.equal(next.outline.faqCandidates.length, 2);
    assert.equal(next.outline.featuredSnippetTarget.heading, 'What is a ball valve?');
  });
});
