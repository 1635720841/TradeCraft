/**
 * 文章任务阶段判定工具（列表筛选与统计共用）。
 */

import type { DraftStaleness } from '../../constants/draft-edit';
import { hasActiveStaleness } from './draft-edit.util';

export function isArticleDraftStale(draftData: unknown): boolean {
  const staleness = (draftData as { staleness?: DraftStaleness | null } | null)?.staleness;
  return hasActiveStaleness(staleness);
}

export function isCmsPublishFailed(seoCheckData: unknown): boolean {
  const cms = (seoCheckData as { cmsPublish?: { lastError?: string; postUrl?: string | null } } | null)
    ?.cmsPublish;
  return Boolean(cms?.lastError && !cms?.postUrl);
}
