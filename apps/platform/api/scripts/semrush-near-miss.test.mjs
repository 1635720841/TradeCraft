/**
 * Semrush 极近及格手术式改写单元测试。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const modPath = pathToFileURL(
  resolve(apiRoot, 'dist/project-types/seo-factory/utils/semrush-near-miss.util.js'),
).href;

const {
  applySemrushNearMissDeterministicFixes,
  applySemrushSidebarComplexWordFixes,
  buildSemrushNearMissSurgicalInstruction,
  extractSemrushCasualSentenceQuotes,
  isSemrushUltraNearMiss,
} = await import(modPath);

describe('isSemrushUltraNearMiss', () => {
  it('detects 8.9 as ultra near miss', () => {
    assert.equal(isSemrushUltraNearMiss(8.9), true);
    assert.equal(isSemrushUltraNearMiss(8.7), false);
  });
});

describe('applySemrushSidebarComplexWordFixes', () => {
  it('replaces only when sidebar flags complex word', () => {
    const content = 'Check compatibility with your load profile.';
    const withSidebar = applySemrushSidebarComplexWordFixes(content, {
      overall: 8.7,
      suggestions: [],
      suggestionDetails: { readability: ['Replace overly complex words: compatibility'] },
      actionableIssues: [
        { category: 'readability', rule: 'complex_word', label: '复杂词', terms: ['compatibility'] },
      ],
    });
    assert.match(withSidebar, /\bfit\b/i);
    assert.doesNotMatch(withSidebar, /compatibility/i);

    const withoutSidebar = applySemrushSidebarComplexWordFixes(content, {
      overall: 8.7,
      suggestions: [],
    });
    assert.match(withoutSidebar, /compatibility/i);
  });
});

describe('applySemrushNearMissDeterministicFixes', () => {
  it('replaces compatibility and filler', () => {
    const input = 'Confirm compatibility with loads. Basically, just verify fit.';
    const out = applySemrushNearMissDeterministicFixes(input);
    assert.match(out, /\bfit\b/i);
    assert.doesNotMatch(out, /compatibility/i);
    assert.doesNotMatch(out, /Basically/i);
  });
});

describe('extractSemrushCasualSentenceQuotes', () => {
  it('matches sidebar fragments to body sentences', () => {
    const content =
      'One buyer insight stands out here. Ask vendors how they store and export fault logs. Warranty terms matter.';
    const quotes = extractSemrushCasualSentenceQuotes(
      {
        tone: ['Ask vendors how they store and export fault logs.', 'One buyer insight stands out'],
      },
      content,
    );
    assert.ok(quotes.some((q) => q.includes('Ask vendors')));
    assert.ok(quotes.some((q) => q.includes('One buyer insight')));
  });
});

describe('buildSemrushNearMissSurgicalInstruction', () => {
  it('builds surgical instruction with casual quotes', () => {
    const content = 'Fault logs also matter. Then check the real duty cycle.';
    const instruction = buildSemrushNearMissSurgicalInstruction(
      {
        overall: 8.9,
        suggestions: [],
        suggestionDetails: { tone: ['Fault logs also matter.', 'Then check the real duty cycle.'] },
      },
      content,
    );
    assert.ok(instruction);
    assert.match(instruction, /SURGICAL MODE/i);
    assert.match(instruction, /Fault logs also matter/);
  });
});
