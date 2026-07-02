/**
 * workflow-step.registry 单元测试：注册顺序与 WORKFLOW_STEPS 一致。
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sharedCorePath = pathToFileURL(
  resolve(apiRoot, '../../../packages/shared-core/dist/index.js'),
).href;
const registryPath = pathToFileURL(
  resolve(apiRoot, 'dist/project-types/seo-factory/modules/workflow/workflow-step.registry.js'),
).href;

const { WORKFLOW_STEPS } = await import(sharedCorePath);

describe('workflow-step.registry', () => {
  it('getOrderedWorkflowStepHandlers respects WORKFLOW_STEPS order', async () => {
    const {
      registerWorkflowStepHandler,
      getOrderedWorkflowStepHandlers,
      isWorkflowStepRegistered,
    } = await import(registryPath);

    registerWorkflowStepHandler({ id: 'serp', run: async () => {} });
    registerWorkflowStepHandler({ id: 'brief', run: async () => {} });
    registerWorkflowStepHandler({ id: 'ymyl', run: async () => {} });

    assert.equal(isWorkflowStepRegistered('serp'), true);
    assert.equal(isWorkflowStepRegistered('draft'), false);

    const ordered = getOrderedWorkflowStepHandlers();
    const ids = ordered.map((handler) => handler.id);
    const expected = WORKFLOW_STEPS.filter((step) =>
      ['serp', 'brief', 'ymyl'].includes(step),
    );
    assert.deepEqual(ids, expected);
  });
});
