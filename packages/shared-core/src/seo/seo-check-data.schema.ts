/**
 * ArticleJob.seoCheckData Zod Schema（写时校验 + 读时迁移后 parse）。
 */

import { z } from 'zod';
import { migrateSeoCheckData } from './seo-check-data.migrate';
import type { ArticleJobSeoCheckData } from './seo-check-data.types';

const looseRecord = z.record(z.unknown());

export const ArticleJobSeoCheckDataSchema = z
  .object({
    _v: z.number().int().optional(),
    workflowProgress: looseRecord.nullable().optional(),
    workflow: looseRecord.optional(),
    local: looseRecord.optional(),
    semrush: looseRecord.optional(),
    quillbot: looseRecord.optional(),
    ymylReview: looseRecord.optional(),
    cmsPublish: looseRecord.optional(),
    scoreThresholds: looseRecord.optional(),
    optimizeHistory: z.array(z.unknown()).optional(),
    optimizationRerun: looseRecord.optional(),
  })
  .passthrough();

export function parseSeoCheckData(raw: unknown): ArticleJobSeoCheckData {
  const migrated = migrateSeoCheckData(raw);
  return ArticleJobSeoCheckDataSchema.parse(migrated) as ArticleJobSeoCheckData;
}

export function safeParseSeoCheckData(raw: unknown): ArticleJobSeoCheckData {
  const migrated = migrateSeoCheckData(raw);
  const parsed = ArticleJobSeoCheckDataSchema.safeParse(migrated);
  if (parsed.success) {
    return parsed.data as ArticleJobSeoCheckData;
  }
  return migrated as ArticleJobSeoCheckData;
}
