/**
 * ArticleJob.seoCheckData 读时迁移（lazy on read，不改 DB 列）。
 */

const CURRENT_VERSION = 1;

import type { ArticleJobSeoCheckDataV1 } from './seo-check-data.types';

export type { ArticleJobSeoCheckDataV1 } from './seo-check-data.types';

export function migrateSeoCheckData(raw: unknown): ArticleJobSeoCheckDataV1 {
  if (!raw || typeof raw !== 'object') {
    return { _v: CURRENT_VERSION };
  }

  const record = { ...(raw as Record<string, unknown>) };
  const version = typeof record._v === 'number' ? record._v : 0;

  if (version < 1) {
    record._v = CURRENT_VERSION;
  }

  return record as ArticleJobSeoCheckDataV1;
}

export function normalizeSeoCheckDataForWrite(
  raw: unknown,
): ArticleJobSeoCheckDataV1 {
  const migrated = migrateSeoCheckData(raw);
  return { ...migrated, _v: CURRENT_VERSION };
}
