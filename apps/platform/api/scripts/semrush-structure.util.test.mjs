/**
 * Semrush Markdown 结构校验单元测试。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const sharedRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../packages/shared-core');
const modPath = pathToFileURL(resolve(sharedRoot, 'dist/seo/semrush-structure.util.js')).href;
const { detectSemrushStructureErrors, enforceArticleH1Boundary, validateAndFixSemrushStructure, repairMarkdownStructureArtifacts } = await import(modPath);

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

  it('repairs inline headings and preserves overflow from an oversized H1', () => {
    const broken =
      '# Battery Pack Safety Guide helps several teams at once. Operators review status quickly. ## Smart BMS Features That Matter Most\n\nBody text.';
    const out = validateAndFixSemrushStructure(broken);
    assert.ok(out.fixed);
    assert.match(out.content, /^# .{1,60}$/m);
    assert.match(out.content, /Operators review status quickly\./);
    assert.match(out.content, /\n\n## Smart BMS Features/);
    assert.equal(detectSemrushStructureErrors(out.content).length, 0);
  });

  it('splits a long one-line paragraph into bounded paragraphs', () => {
    const sentence = 'Operators review battery status and confirm wiring before deployment.';
    const broken = `# Safe BMS Guide\n\n${Array.from({ length: 10 }, () => sentence).join(' ')}`;
    const out = validateAndFixSemrushStructure(broken);
    assert.ok(out.fixed);
    const paragraphs = out.content.split(/\n\n+/).filter((part) => !part.startsWith('#'));
    assert.ok(paragraphs.length >= 2);
    assert.ok(paragraphs.every((part) => part.split(/\s+/).length <= 65));
  });

  it('removes repeated headings without deleting section content', () => {
    const broken =
      '# Guide\n\n## How it works\n\n## How it works\n\nFirst body paragraph.\n\n## Details\n\nSecond body paragraph.';
    const out = validateAndFixSemrushStructure(broken);
    assert.ok(out.fixed);
    assert.equal((out.content.match(/^## How it works$/gm) ?? []).length, 1);
    assert.match(out.content, /First body paragraph\./);
    assert.match(out.content, /Second body paragraph\./);
    assert.equal(detectSemrushStructureErrors(out.content).length, 0);
  });

  it('removes a leaked inline table of contents and restores section boundaries', () => {
    const broken =
      '# BMS Guide\n\nIntro text.\n\nTable of contents - [What SOC estimation means](https://sem.example/check#meaning) - [How SOC estimation works](https://sem.example/check#works) ##. What SOC estimation means State-of-Charge shows usable energy. ## How SOC estimation works The filter combines model and sensor data.';
    const out = validateAndFixSemrushStructure(broken);
    assert.ok(out.fixed);
    assert.doesNotMatch(out.content, /Table of contents/i);
    assert.match(out.content, /## What SOC estimation means\n\nState-of-Charge shows usable energy\./);
    assert.match(out.content, /## How SOC estimation works\n\nThe filter combines model and sensor data\./);
    assert.equal(detectSemrushStructureErrors(out.content).length, 0);
  });

  it('moves oversized H2 overflow into a body paragraph', () => {
    const broken = `# Guide\n\n## ${Array.from({ length: 24 }, (_, index) => `word${index}`).join(' ')}`;
    const out = validateAndFixSemrushStructure(broken);
    assert.ok(out.fixed);
    const heading = out.content.match(/^## (.+)$/m)?.[1] ?? '';
    assert.ok(heading.split(/\s+/).length <= 16);
    assert.match(out.content, /\n\nword16/);
    assert.equal(detectSemrushStructureErrors(out.content).length, 0);
  });

  it('adds blank lines around otherwise valid heading lines', () => {
    const broken = '# Guide\nIntro.\n## Details\nBody.';
    const out = validateAndFixSemrushStructure(broken);
    assert.ok(out.fixed);
    assert.equal(out.content, '# Guide\n\nIntro.\n\n## Details\n\nBody.');
    assert.equal(detectSemrushStructureErrors(out.content).length, 0);
  });

  it('restores an exact H1 boundary without dropping the glued introduction', () => {
    const broken = '# BMS Kalman Filter SOC Estimation BMS Kalman filter SOC estimation helps teams make decisions.';
    const bounded = enforceArticleH1Boundary(broken, 'BMS Kalman Filter SOC Estimation');
    assert.equal(
      bounded,
      '# BMS Kalman Filter SOC Estimation\n\nBMS Kalman filter SOC estimation helps teams make decisions.',
    );
  });

  it('moves dash-separated and swallowed prose out of H2 headings', () => {
    const broken =
      '# Guide\n\n## Typical setup steps - Record the original value before changes.\n\n## Related charging parameters to review Do not adjust current in isolation. Review charge voltage too.\n\n## Common mistakes and troubleshooting A common mistake is expecting the BMS to control every charger.';
    const out = validateAndFixSemrushStructure(broken);
    assert.match(out.content, /## Typical setup steps\n\nRecord the original value before changes\./);
    assert.match(out.content, /## Related charging parameters to review\n\nDo not adjust current in isolation\./);
    assert.match(out.content, /## Common mistakes and troubleshooting\n\nA common mistake is expecting/);
    assert.equal(detectSemrushStructureErrors(out.content).length, 0);
  });

  it('splits paragraphs and list items that contain too many sentences', () => {
    const broken =
      '# Guide\n\nFirst sentence. Second sentence. Third sentence. Fourth sentence. Fifth sentence.\n\n- Record each cutoff. End the test safely. Stop if cables heat. Document the result.';
    const out = validateAndFixSemrushStructure(broken);
    assert.match(out.content, /First sentence\. Second sentence\. Third sentence\.\n\nFourth sentence/);
    assert.equal((out.content.match(/^- /gm) ?? []).length, 4);
    assert.equal(detectSemrushStructureErrors(out.content).length, 0);
  });

  it('leaves valid markdown unchanged', () => {
    const good = '# Title\n\nParagraph one.\n\n## Section\n\n- Item A\n- Item B';
    const out = validateAndFixSemrushStructure(good);
    assert.equal(out.fixed, false);
    assert.equal(out.content, good);
  });

  it('removes orphan bold markers and double list dashes', () => {
    const broken =
      '**How does remote monitoring help daily operations?\n\n**\n\nRemote monitoring helps teams.\n\n- - A 12 volts pack needs different control.';
    const out = validateAndFixSemrushStructure(broken);
    assert.doesNotMatch(out.content, /^\*\*$/m);
    assert.match(out.content, /### How does remote monitoring help daily operations\?/);
    assert.match(out.content, /^- A 12 volts pack/m);
  });

  it('repairs duplicate ordered-list markers from LLM lazy numbering', () => {
    const broken = `Follow this order:
1. Turn off the system and confirm no charging and discharging current flows.
1. 2.
1. Disconnect the main leads and secure them apart.
1. 3.
1. Label each balance wire before removal.
1. 4.`;
    const out = validateAndFixSemrushStructure(broken);
    assert.ok(out.fixed);
    assert.doesNotMatch(out.content, /^1\. 2\.$/m);
    assert.doesNotMatch(out.content, /^1\. 3\.$/m);
    assert.match(out.content, /^1\. Turn off the system/m);
    assert.match(out.content, /^1\. Disconnect the main leads/m);
    assert.match(out.content, /^1\. Label each balance wire/m);
    assert.equal(detectSemrushStructureErrors(out.content).length, 0);
  });

  it('strips inline step numbers without splitting into orphan rows', () => {
    const broken =
      'Follow this order:\n1. Turn off the system.\n1. 2. Disconnect the main leads. Keep the leads apart. Verify polarity.\n1. 3. Label each balance wire.';
    const out = validateAndFixSemrushStructure(broken);
    assert.doesNotMatch(out.content, /^1\. 2\.$/m);
    assert.match(out.content, /^1\. Disconnect the main leads\./m);
    assert.match(out.content, /Keep the leads apart\./);
  });

  it('converts inline ordered steps in a paragraph to a list block', () => {
    const broken =
      'Follow this order: 1. Turn off the system. 2. Disconnect the main leads. 3. Label each balance wire.';
    const out = validateAndFixSemrushStructure(broken);
    assert.match(out.content, /Follow this order:/);
    assert.match(out.content, /^1\. Turn off the system\./m);
    assert.match(out.content, /^2\. Disconnect the main leads\./m);
    assert.match(out.content, /^3\. Label each balance wire\./m);
    assert.equal(detectSemrushStructureErrors(out.content).length, 0);
  });

  it('removes blank lines between ordered list items', () => {
    const broken = '1. Step one.\n\n2. Step two.\n\n3. Step three.';
    const out = validateAndFixSemrushStructure(broken);
    assert.doesNotMatch(out.content, /1\. Step one\.\n\n2\./);
    assert.match(out.content, /1\. Step one\.\n2\. Step two\./);
  });

  it('splits short H2 headings that swallowed body text', () => {
    const broken = '## Setup steps Record the value before changes.';
    const out = validateAndFixSemrushStructure(broken);
    assert.match(out.content, /## Setup steps\n\nRecord the value before changes\./);
    assert.equal(detectSemrushStructureErrors(out.content).length, 0);
  });

  it('repairMarkdownStructureArtifacts fixes user BMS list without other errors', () => {
    const broken = `Follow this order:
1. Turn off the system and confirm no charging and discharging current flows.
1. 2.
1. Disconnect the main leads and secure them apart.
1. 3.
1. Label each balance wire before removal.
1. 4.`;
    const fixed = repairMarkdownStructureArtifacts(broken);
    assert.doesNotMatch(fixed, /^1\. 2\.$/m);
    assert.match(fixed, /^1\. Disconnect the main leads/m);
    assert.match(fixed, /^1\. Label each balance wire/m);
  });

  it('repairMarkdownStructureArtifacts splits inline dash pseudo bullet lists', () => {
    const broken = `- complete manuals and wiring diagrams - firmware or app update support - warranty coverage and claim process.`;
    const fixed = repairMarkdownStructureArtifacts(broken);
    assert.match(fixed, /^- complete manuals and wiring diagrams$/m);
    assert.match(fixed, /^- firmware or app update support$/m);
    assert.match(fixed, /^- warranty coverage and claim process\.$/m);
  });

  it('repairMarkdownStructureArtifacts expands bullets after list intro colon', () => {
    const broken = `Look for these features:

overvoltage and undervoltage protection - charge and discharge.
current limits - temperature sensing at the pack and cell level - alarms for warning states before shutdown - event logging for support and maintenance teams.`;
    const fixed = repairMarkdownStructureArtifacts(broken);
    assert.match(fixed, /^- overvoltage and undervoltage protection$/m);
    assert.match(fixed, /^- charge and discharge\.$/m);
    assert.match(fixed, /^- current limits$/m);
    assert.match(fixed, /^- event logging for support and maintenance teams\.$/m);
  });
});
