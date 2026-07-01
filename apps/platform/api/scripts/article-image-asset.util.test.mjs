import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { collectArticleImageAssetIds } from '../dist/project-types/seo-factory/modules/illustration/article-image.util.js';

describe('collectArticleImageAssetIds', () => {
  it('collects non-empty asset ids', () => {
    const ids = collectArticleImageAssetIds([
      { alt: 'a', url: 'u1', source: 'upload', assetId: 'id-1' },
      { alt: 'b', url: 'u2', source: 'bfl' },
      { alt: 'c', url: 'u3', source: 'url', assetId: 'id-2' },
    ]);
    assert.deepEqual(ids, ['id-1', 'id-2']);
  });
});
