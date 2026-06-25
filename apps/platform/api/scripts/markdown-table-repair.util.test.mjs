/**
 * Markdown 表格修复单元测试。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const sharedRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../packages/shared-core');
const modPath = pathToFileURL(resolve(sharedRoot, 'dist/seo/markdown-table-repair.util.js')).href;
const structurePath = pathToFileURL(resolve(sharedRoot, 'dist/seo/semrush-structure.util.js')).href;
const contentPath = pathToFileURL(
  resolve(dirname(fileURLToPath(import.meta.url)), '../dist/project-types/seo-factory/providers/semrush/semrush-content.js'),
).href;

const { repairMarkdownTables } = await import(modPath);
const { validateAndFixSemrushStructure } = await import(structurePath);
const { markdownToSemrushHtml } = await import(contentPath);

describe('repairMarkdownTables', () => {
  it('repairs inline KPI table glued with double pipes', () => {
    const broken =
      'KPI tracking should link control choices to business impact, not only lab data. | KPI | Why it matters | Typical owner | |. --- | --- | --- | | Recovered energy | Shows range and efficiency value | Controls and energy teams | | Stopping distance | Protects compliance and safety margin | Brake and safety teams | | Stability margin | Shows behavior on low grip and split-mu | Vehicle dynamics team |';
    const fixed = repairMarkdownTables(broken);
    assert.match(fixed, /KPI tracking should link control choices/);
    assert.match(fixed, /\| KPI \| Why it matters \| Typical owner \|/);
    assert.match(fixed, /\| --- \| --- \| --- \|/);
    assert.match(fixed, /\| Recovered energy \| Shows range and efficiency value \| Controls and energy teams \|/);
    assert.match(fixed, /\| Stopping distance \| Protects compliance and safety margin \| Brake and safety teams \|/);
    assert.doesNotMatch(fixed, /\|\|/);
  });

  it('repairs strategy comparison table with glued rows', () => {
    const broken =
      '| Strategy | Main risk | Best fit | |. --- | --- | --- | | Rule-based | Fast to deploy and explain | High-volume launches | | Fuzzy | Smooth blending under uncertainty | Harder validation trace |';
    const fixed = repairMarkdownTables(broken);
    assert.match(fixed, /\| Strategy \| Main risk \| Best fit \|/);
    assert.match(fixed, /\| --- \| --- \| --- \|/);
    assert.match(fixed, /\| Rule-based \| Fast to deploy and explain \| High-volume launches \|/);
    assert.match(fixed, /\| Fuzzy \| Smooth blending under uncertainty \| Harder validation trace \|/);
    assert.doesNotMatch(fixed, /\|\|/);
  });

  it('repairs table introduced by colon after prose', () => {
    const broken =
      'Simulation data helps teams compare these choices before road work starts. Use this decision table during concept review: | Method | Strength | . Main risk | Best fit | | --- | --- | ---. | --- | | Rule-based | Fast to deploy and explain |.';
    const fixed = repairMarkdownTables(broken);
    assert.match(fixed, /concept review:\n\n\| Method \| Strength \| Main risk \| Best fit \|/);
    assert.match(fixed, /\| --- \| --- \| --- \| --- \|/);
    assert.match(fixed, /\| Rule-based \| Fast to deploy and explain \|/);
    assert.doesNotMatch(fixed, /\|\|/);
  });

  it('leaves valid markdown tables unchanged', () => {
    const good = '| Use case | Priority |\n| --- | --- |\n| EV fleet | Fast diagnostics |';
    assert.equal(repairMarkdownTables(good), good);
  });

  it('preserves prose glued after the final flattened table row', () => {
    const broken =
      'They work best when buyers match the tariff risk.| Option | Main goal | Best timing | Main value | | --- | --- | --- | --- | | Peak shaving | Reduce demand peaks | During short spikes | Lower demand charges | | Load shifting | Move flexible processes | Before or after peaks | Better tariff timing | | Energy shifting | Store cheap energy | Across time periods | Cost reduction | Use peak shaving when one monthly peak drives the bill.';
    const fixed = repairMarkdownTables(broken);
    assert.match(fixed, /\| Energy shifting \| Store cheap energy \| Across time periods \| Cost reduction \|/);
    assert.match(fixed, /\n\nUse peak shaving when one monthly peak drives the bill\./);
  });
});

describe('validateAndFixSemrushStructure (tables)', () => {
  it('repairs malformed tables during structure validation', () => {
    const broken =
      'Intro paragraph.\n\n| KPI | Why it matters | Typical owner | |. --- | --- | --- | | Recovered energy | Shows range | Energy team |';
    const out = validateAndFixSemrushStructure(broken);
    assert.ok(out.fixed);
    assert.match(out.content, /\| KPI \| Why it matters \| Typical owner \|/);
    assert.match(out.content, /\| Recovered energy \| Shows range \| Energy team \|/);
  });
});

describe('markdownToSemrushHtml (malformed tables)', () => {
  it('renders repaired inline tables as semrush paragraphs', () => {
    const broken =
      'KPI tracking matters. | KPI | Why it matters | Typical owner | |. --- | --- | --- | | Recovered energy | Shows range | Energy team |';
    const html = markdownToSemrushHtml(broken);
    assert.doesNotMatch(html, /<table>/);
    assert.match(html, /<strong>Recovered energy<\/strong>/);
    assert.match(html, /<strong>Why it matters:<\/strong> Shows range/);
    assert.doesNotMatch(html, /\| --- \|/);
  });

  it('flattens comparison table without gluing cell text', () => {
    const broken =
      'Use this decision table during concept review: | Method | Strength | Main risk | Best fit | | --- | --- | --- | --- | | Rule-based | Fast to deploy and explain | Calibration growth | High-volume launches | | Fuzzy | Smooth blending under uncertainty | Harder validation trace | Comfort-focused programs | | Model predictive | Strong multi-input control | Higher integration risk | Advanced brake-by-wire platforms |';
    const html = markdownToSemrushHtml(broken);
    assert.doesNotMatch(html, /<table>/);
    assert.match(html, /<strong>Fuzzy<\/strong>/);
    assert.match(html, /<strong>Model predictive<\/strong>/);
    assert.doesNotMatch(html, /FuzzySmooth/);
    assert.doesNotMatch(html, /uncertaintyHarder/);
  });

  it('keeps prose after the final malformed table row in Semrush HTML', () => {
    const broken =
      'Comparison: | Option | Goal | Timing | Value | | --- | --- | --- | --- | | Peak shaving | Cut peaks | Short spikes | Lower charges | Use peak shaving when one monthly peak drives the bill.\n\nLater paragraphs must remain visible.';
    const html = markdownToSemrushHtml(broken);
    assert.match(html, /Use peak shaving when one monthly peak drives the bill\./);
    assert.match(html, /Later paragraphs must remain visible\./);
  });
});
