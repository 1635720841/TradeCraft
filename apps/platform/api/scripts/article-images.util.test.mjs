import assert from 'node:assert/strict';
import {
  applyArticleImageEditsToContent,
  removeImageMarkdownFromContent,
} from '../dist/project-types/seo-factory/modules/illustration/article-images-edit.util.js';

const content = `# Title

## Section A

Some text.

![old alt](https://cdn.example/old.png)

## Section B

More text.
`;

const previous = [
  {
    alt: 'old alt',
    url: 'https://cdn.example/old.png',
    source: 'bfl',
    insertAfterHeading: 'Section A',
  },
];

const removed = removeImageMarkdownFromContent(content, previous[0].url);
assert.ok(!removed.includes('old.png'), 'should remove old image markdown');

const patched = applyArticleImageEditsToContent(content, previous, [
  {
    alt: 'new alt',
    url: 'https://cdn.example/new.png',
    source: 'upload',
    insertAfterHeading: 'Section B',
  },
]);

assert.equal(patched.images.length, 1);
assert.equal(patched.images[0].url, 'https://cdn.example/new.png');
assert.ok(patched.content.includes('new.png'));
assert.ok(!patched.content.includes('old.png'));

const sectioned = `# Title

## Section A

Paragraph A.

## Section B

Paragraph B.
`;
const placed = applyArticleImageEditsToContent(sectioned, [], [
  {
    alt: 'img a',
    url: 'https://cdn.example/a.png',
    source: 'bfl',
    insertAfterHeading: 'Section A',
  },
]);
const aIndex = placed.content.indexOf('a.png');
const bHeadingIndex = placed.content.indexOf('## Section B');
assert.ok(aIndex > 0 && aIndex < bHeadingIndex, 'image should sit inside Section A');

console.log('article-images.util.test.mjs passed');
