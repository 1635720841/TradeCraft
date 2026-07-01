import assert from 'node:assert/strict';
import test from 'node:test';

process.env.AUTH_JWT_SECRET = 'test-media-asset-signing-secret';

const {
  buildMediaAssetPublicUrl,
  parseMediaAssetApiUrl,
  verifyMediaAssetSignedQuery,
} = await import('../dist/modules/media/media-url.util.js');

const ASSET_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

test('buildMediaAssetPublicUrl includes signed query', () => {
  const url = buildMediaAssetPublicUrl('proj1', ASSET_ID);
  assert.match(
    url,
    /^\/api\/v1\/projects\/proj1\/media\/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee\/file\?exp=\d+&sig=[a-f0-9]+$/,
  );

  const parsed = parseMediaAssetApiUrl(url);
  assert.deepEqual(parsed, {
    projectId: 'proj1',
    assetId: ASSET_ID,
  });

  const query = new URL(`http://local${url}`).searchParams;
  assert.equal(
    verifyMediaAssetSignedQuery(
      'proj1',
      ASSET_ID,
      query.get('exp') ?? undefined,
      query.get('sig') ?? undefined,
    ),
    true,
  );
});

test('verifyMediaAssetSignedQuery rejects tampered signature', () => {
  const url = buildMediaAssetPublicUrl('proj1', ASSET_ID);
  const query = new URL(`http://local${url}`).searchParams;
  assert.equal(
    verifyMediaAssetSignedQuery(
      'proj1',
      ASSET_ID,
      query.get('exp') ?? undefined,
      `${query.get('sig')}0`,
    ),
    false,
  );
});
