/**
 * MediaIngestService 单元测试：contentHash 去重、bind 引用计数、租户范围。
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const { MediaIngestService } = require(
  resolve(apiRoot, 'dist/modules/media/media-ingest.service.js'),
);
const { buildMediaAssetPublicUrl } = require(
  resolve(apiRoot, 'dist/modules/media/media-url.util.js'),
);

process.env.AUTH_JWT_SECRET = 'test-media-ingest-signing-secret';

const ORG_ID = '00000000-0000-4000-8000-000000000101';
const PROJECT_A = '00000000-0000-4000-8000-000000000201';
const PROJECT_B = '00000000-0000-4000-8000-000000000202';
const EXISTING_ASSET_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const SAMPLE_BUFFER = Buffer.from('fake-png-bytes-for-dedup-test');
const SAMPLE_HASH = createHash('sha256').update(SAMPLE_BUFFER).digest('hex');

function createPrisma(initialAssets = []) {
  const assets = [...initialAssets];

  return {
    assets,
    mediaAsset: {
      findFirst: async ({ where }) =>
        assets.find(
          (row) =>
            row.organizationId === where.organizationId &&
            row.projectId === where.projectId &&
            row.contentHash === where.contentHash,
        ) ?? null,
      create: async ({ data }) => {
        const row = { ...data };
        assets.push(row);
        return row;
      },
      update: async ({ where, data }) => {
        const idx = assets.findIndex((row) => row.id === where.id);
        assert.notEqual(idx, -1, 'asset should exist for update');
        if (data.referenceCount?.increment) {
          assets[idx].referenceCount += data.referenceCount.increment;
        }
        return assets[idx];
      },
    },
  };
}

function createStorage() {
  const putCalls = [];
  const deleteCalls = [];

  return {
    putCalls,
    deleteCalls,
    putObject: async (key, body, contentType) => {
      putCalls.push({ key, body, contentType });
    },
    deleteByPrefix: async (key) => {
      deleteCalls.push(key);
    },
  };
}

function createLogger() {
  return {
    info: () => {},
    warn: () => {},
  };
}

function createService(prisma, storage) {
  return new MediaIngestService(prisma, storage, createLogger());
}

function baseInput(overrides = {}) {
  return {
    organizationId: ORG_ID,
    projectId: PROJECT_A,
    source: 'UPLOAD',
    buffer: SAMPLE_BUFFER,
    contentType: 'image/png',
    ...overrides,
  };
}

describe('MediaIngestService.persistAsset / contentHash dedup', () => {
  it('creates a new asset when contentHash is unseen', async () => {
    const prisma = createPrisma();
    const storage = createStorage();
    const service = createService(prisma, storage);

    const result = await service.ingestFromBuffer(baseInput());

    assert.equal(prisma.assets.length, 1);
    assert.equal(storage.putCalls.length, 1);
    assert.equal(storage.deleteCalls.length, 0);
    assert.equal(result.assetId, prisma.assets[0].id);
    assert.equal(result.contentType, 'image/png');
    assert.equal(result.sizeBytes, SAMPLE_BUFFER.length);
    assert.equal(prisma.assets[0].contentHash, SAMPLE_HASH);
    assert.equal(prisma.assets[0].referenceCount, 0);
  });

  it('reuses existing asset by contentHash within org+project', async () => {
    const prisma = createPrisma([
      {
        id: EXISTING_ASSET_ID,
        organizationId: ORG_ID,
        projectId: PROJECT_A,
        storageKey: `${ORG_ID}/${PROJECT_A}/media/${EXISTING_ASSET_ID}.png`,
        contentType: 'image/png',
        sizeBytes: SAMPLE_BUFFER.length,
        contentHash: SAMPLE_HASH,
        referenceCount: 2,
        source: 'UPLOAD',
      },
    ]);
    const storage = createStorage();
    const service = createService(prisma, storage);

    const result = await service.ingestFromBuffer(baseInput());

    assert.equal(result.assetId, EXISTING_ASSET_ID);
    assert.equal(result.url, buildMediaAssetPublicUrl(PROJECT_A, EXISTING_ASSET_ID));
    assert.equal(prisma.assets.length, 1);
    assert.equal(storage.putCalls.length, 0);
    assert.equal(storage.deleteCalls.length, 1);
    assert.match(storage.deleteCalls[0], new RegExp(`${ORG_ID}/${PROJECT_A}/media/`));
  });

  it('increments referenceCount when bind=true on dedup hit', async () => {
    const prisma = createPrisma([
      {
        id: EXISTING_ASSET_ID,
        organizationId: ORG_ID,
        projectId: PROJECT_A,
        storageKey: `${ORG_ID}/${PROJECT_A}/media/${EXISTING_ASSET_ID}.png`,
        contentType: 'image/png',
        sizeBytes: SAMPLE_BUFFER.length,
        contentHash: SAMPLE_HASH,
        referenceCount: 1,
        source: 'BFL',
      },
    ]);
    const storage = createStorage();
    const service = createService(prisma, storage);

    await service.ingestFromBuffer(baseInput({ bind: true }));

    assert.equal(prisma.assets[0].referenceCount, 2);
    assert.equal(storage.putCalls.length, 0);
  });

  it('does not dedup across different projects', async () => {
    const prisma = createPrisma([
      {
        id: EXISTING_ASSET_ID,
        organizationId: ORG_ID,
        projectId: PROJECT_A,
        storageKey: `${ORG_ID}/${PROJECT_A}/media/${EXISTING_ASSET_ID}.png`,
        contentType: 'image/png',
        sizeBytes: SAMPLE_BUFFER.length,
        contentHash: SAMPLE_HASH,
        referenceCount: 0,
        source: 'UPLOAD',
      },
    ]);
    const storage = createStorage();
    const service = createService(prisma, storage);

    const result = await service.ingestFromBuffer(baseInput({ projectId: PROJECT_B }));

    assert.notEqual(result.assetId, EXISTING_ASSET_ID);
    assert.equal(prisma.assets.length, 2);
    assert.equal(storage.putCalls.length, 1);
  });

  it('rejects empty buffer', async () => {
    const prisma = createPrisma();
    const storage = createStorage();
    const service = createService(prisma, storage);

    await assert.rejects(
      () => service.ingestFromBuffer(baseInput({ buffer: Buffer.alloc(0) })),
      (error) => error?.message?.includes('图片内容为空'),
    );
  });
});
