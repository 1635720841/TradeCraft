/**
 * Semrush Markdown 结构校验单元测试。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const sharedRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../packages/shared-core');
const modPath = pathToFileURL(resolve(sharedRoot, 'dist/seo/semrush-structure.util.js')).href;
const { detectSemrushStructureErrors, validateAndFixSemrushStructure } = await import(modPath);

describe('validateAndFixSemrushStructure', () => {
  it('fixes glued heading after period', () => {
    const broken = 'High demand.## How Smart BMS Works\n\nBody text.';
    const out = validateAndFixSemrushStructure(broken);
    assert.ok(out.fixed);
    assert.match(out.content, /demand\.\n\n## How Smart BMS/);
    assert.equal(detectSemrushStructureErrors(out.content).length, 0);
  });

  it('fixes missing break after lowercase period before capital', () => {
    const broken = 'Review these settings.Key features include voltage.';
    const out = validateAndFixSemrushStructure(broken);
    assert.ok(out.fixed);
    assert.match(out.content, /settings\.\n\nKey features/);
  });

  it('leaves valid markdown unchanged', () => {
    const good = '# Title\n\nParagraph one.\n\n## Section\n\n- Item A\n- Item B';
    const out = validateAndFixSemrushStructure(good);
    assert.equal(out.fixed, false);
    assert.equal(out.content, good);
  });
});
