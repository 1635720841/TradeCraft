/**
 * 工作流续跑推断单元测试。
 * 用法：cd apps/platform/api && pnpm test:workflow
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const resumePath = pathToFileURL(
  resolve(apiRoot, 'dist/project-types/seo-factory/constants/workflow-resume.js'),
).href;
const { WORKFLOW_STEPS, resolveResumeStep, resolveFailedStep } = await import(resumePath);

describe('WORKFLOW_STEPS', () => {
  it('runs enrichment before Semrush', () => {
    assert.deepEqual(WORKFLOW_STEPS, [
      'serp',
      'brief',
      'draft',
      'linking',
      'images',
      'optimizing',
      'ymyl',
    ]);
  });
});

describe('resolveResumeStep', () => {
  it('resumes linking when draft exists but links not applied', () => {
    assert.equal(
      resolveResumeStep({
        serpData: {},
        briefData: { outline: [] },
        draftData: { content: '# Draft' },
        seoCheckData: {},
        semrushScore: null,
      }),
      'linking',
    );
  });

  it('resumes images after linking', () => {
    assert.equal(
      resolveResumeStep({
        serpData: {},
        briefData: { outline: [] },
        draftData: { content: '# Draft', internalLinksApplied: true },
        seoCheckData: {},
        semrushScore: null,
      }),
      'images',
    );
  });

  it('resumes optimizing after images', () => {
    assert.equal(
      resolveResumeStep({
        serpData: {},
        briefData: { outline: [] },
        draftData: {
          content: '# Draft',
          internalLinksApplied: true,
          imagesApplied: true,
        },
        seoCheckData: {},
        semrushScore: null,
      }),
      'optimizing',
    );
  });

  it('resumes optimizing when Semrush failed below pass threshold', () => {
    assert.equal(
      resolveResumeStep({
        serpData: {},
        briefData: { outline: [] },
        draftData: {
          content: '# Draft',
          internalLinksApplied: true,
          imagesApplied: true,
        },
        seoCheckData: {
          semrush: { overall: 8.9, passed: false },
        },
        semrushScore: 8.9,
      }),
      'optimizing',
    );
  });
});

describe('resolveFailedStep', () => {
  it('maps illustrating status to images step', () => {
    assert.equal(
      resolveFailedStep({
        status: 'ILLUSTRATING',
        briefData: {},
        draftData: { content: '# Draft' },
      }),
      'images',
    );
  });
});
