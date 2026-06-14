import assert from 'node:assert/strict';
import test from 'node:test';

process.env.AUTH_JWT_SECRET = 'test-draft-image-signing-secret';

const {
  buildDraftImagePublicUrl,
  parseDraftImageApiUrl,
  verifyDraftImageSignedQuery,
} = await import('../dist/project-types/seo-factory/modules/article-job/draft-image.util.js');

test('buildDraftImagePublicUrl includes signed query', () => {
  const url = buildDraftImagePublicUrl('proj1', 'job1', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg');
  assert.match(url, /^\/api\/v1\/projects\/proj1\/article-jobs\/job1\/draft\/images\/.+\?exp=\d+&sig=[a-f0-9]+$/);

  const parsed = parseDraftImageApiUrl(url);
  assert.deepEqual(parsed, {
    projectId: 'proj1',
    jobId: 'job1',
    filename: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg',
  });

  const query = new URL(`http://local${url}`).searchParams;
  assert.equal(
    verifyDraftImageSignedQuery(
      'proj1',
      'job1',
      'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg',
      query.get('exp') ?? undefined,
      query.get('sig') ?? undefined,
    ),
    true,
  );
});

test('verifyDraftImageSignedQuery rejects tampered signature', () => {
  const url = buildDraftImagePublicUrl('proj1', 'job1', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.png');
  const query = new URL(`http://local${url}`).searchParams;
  assert.equal(
    verifyDraftImageSignedQuery(
      'proj1',
      'job1',
      'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.png',
      query.get('exp') ?? undefined,
      `${query.get('sig')}0`,
    ),
    false,
  );
});

test('dev fallback secret when AUTH_JWT_SECRET unset', () => {
  const prev = process.env.AUTH_JWT_SECRET;
  const prevNodeEnv = process.env.NODE_ENV;
  delete process.env.AUTH_JWT_SECRET;
  process.env.NODE_ENV = 'development';

  try {
    const url = buildDraftImagePublicUrl('proj1', 'job1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.webp');
    const query = new URL(`http://local${url}`).searchParams;
    assert.equal(
      verifyDraftImageSignedQuery(
        'proj1',
        'job1',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.webp',
        query.get('exp') ?? undefined,
        query.get('sig') ?? undefined,
      ),
      true,
    );
  } finally {
    if (prev === undefined) delete process.env.AUTH_JWT_SECRET;
    else process.env.AUTH_JWT_SECRET = prev;
    process.env.NODE_ENV = prevNodeEnv;
  }
});
