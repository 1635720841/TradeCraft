import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  countSemrushSuggestions,
  flattenSemrushSuggestions,
  hasAnySemrushSuggestions,
  mergeSemrushSuggestionDetails,
} from '../dist/project-types/seo-factory/providers/semrush/semrush-rpa-suggestion-details.util.js';

describe('semrush-rpa-suggestion-details.util', () => {
  it('hasAnySemrushSuggestions detects non-empty sections', () => {
    assert.equal(hasAnySemrushSuggestions({}), false);
    assert.equal(hasAnySemrushSuggestions({ seo: ['add keyword'] }), true);
  });

  it('mergeSemrushSuggestionDetails dedupes trimmed strings', () => {
    const merged = mergeSemrushSuggestionDetails(
      { readability: [' Foo ', 'bar'] },
      { readability: ['foo', 'baz'], tone: ['casual'] },
    );
    assert.deepEqual(merged.readability, ['Foo', 'bar', 'foo', 'baz']);
    assert.deepEqual(merged.tone, ['casual']);
  });

  it('flattenSemrushSuggestions prefixes section labels', () => {
    const flat = flattenSemrushSuggestions({ seo: ['use H2'] });
    assert.equal(flat[0], '[SEO] use H2');
    assert.equal(countSemrushSuggestions({ seo: ['a', 'b'] }), 2);
  });
});
