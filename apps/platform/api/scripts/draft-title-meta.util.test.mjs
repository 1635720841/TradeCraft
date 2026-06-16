import assert from 'node:assert/strict';
import test from 'node:test';

function extractMarkdownH1(content) {
  const match = content.replace(/\r\n/g, '\n').match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() ?? '';
}

function resolveDraftTitleAndMeta(draft, brief) {
  const title =
    draft?.title?.trim() ||
    brief?.outline?.title?.trim() ||
    extractMarkdownH1(draft?.content ?? '') ||
    '';

  return {
    title,
    metaDescription: draft?.metaDescription?.trim() ?? '',
  };
}

test('resolveDraftTitleAndMeta falls back to brief and markdown H1', () => {
  assert.equal(extractMarkdownH1('# Hello World\n\nBody'), 'Hello World');

  assert.deepEqual(
    resolveDraftTitleAndMeta(
      { content: '# From H1\n\nBody', metaDescription: '  meta  ' },
      { outline: { title: 'Brief title' } },
    ),
    { title: 'Brief title', metaDescription: 'meta' },
  );

  assert.deepEqual(
    resolveDraftTitleAndMeta({ content: '# From H1 only\n\nBody' }, null),
    { title: 'From H1 only', metaDescription: '' },
  );

  assert.deepEqual(
    resolveDraftTitleAndMeta({ content: 'No heading' }, { outline: { title: 'Brief title' } }),
    { title: 'Brief title', metaDescription: '' },
  );
});
