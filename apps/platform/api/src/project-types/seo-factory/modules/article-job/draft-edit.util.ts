/**
 * 稿件手动编辑纯函数：staleness 计算、diff 统计。
 *
 * 边界：
 * - 不负责：持久化（ArticleJobDraftEditService）
 */

import {
  CONTENT_MAJOR_CHANGE_RATIO,
  type DraftStaleness,
  type DraftStalenessAffected,
  type ManualEditChangeSummary,
} from '../../constants/draft-edit';

export interface DraftEditFields {
  title?: string;
  metaDescription?: string;
  content?: string;
}

export function computeContentDiffStats(before: string, after: string): ManualEditChangeSummary['contentDiffStats'] {
  const b = before.trim();
  const a = after.trim();
  return {
    charsBefore: b.length,
    charsAfter: a.length,
    added: Math.max(0, a.length - b.length),
    removed: Math.max(0, b.length - a.length),
  };
}

/** 字符级差异占比，用于判断是否「大改」 */
export function computeContentChangeRatio(before: string, after: string): number {
  const b = before.trim();
  const a = after.trim();
  if (b === a) return 0;

  const maxLen = Math.max(b.length, a.length, 1);
  let mismatches = Math.abs(b.length - a.length);
  const shorter = b.length <= a.length ? b : a;
  const longer = b.length <= a.length ? a : b;

  for (let i = 0; i < shorter.length; i++) {
    if (shorter[i] !== longer[i]) {
      mismatches++;
    }
  }

  return mismatches / maxLen;
}

export function isMajorContentChange(before: string, after: string): boolean {
  return computeContentChangeRatio(before, after) >= CONTENT_MAJOR_CHANGE_RATIO;
}

export function computeDraftStaleness(
  before: DraftEditFields,
  after: DraftEditFields,
): { affected: DraftStalenessAffected; titleMetaChanged: boolean; contentChanged: boolean } | null {
  const titleChanged = (before.title ?? '') !== (after.title ?? '');
  const metaChanged = (before.metaDescription ?? '') !== (after.metaDescription ?? '');
  const contentChanged = (before.content ?? '').trim() !== (after.content ?? '').trim();

  if (!titleChanged && !metaChanged && !contentChanged) {
    return null;
  }

  const titleMetaChanged = titleChanged || metaChanged;
  const majorContent = contentChanged && isMajorContentChange(before.content ?? '', after.content ?? '');

  return {
    titleMetaChanged,
    contentChanged,
    affected: {
      localSeo: titleMetaChanged || contentChanged,
      semrush: contentChanged,
      paraphrase: contentChanged,
      ymyl: titleChanged || contentChanged,
      export: titleMetaChanged || contentChanged,
      internalLinks: majorContent,
      images: majorContent,
    },
  };
}

export function buildChangeSummary(before: DraftEditFields, after: DraftEditFields): ManualEditChangeSummary {
  return {
    titleChanged: (before.title ?? '') !== (after.title ?? ''),
    metaChanged: (before.metaDescription ?? '') !== (after.metaDescription ?? ''),
    contentDiffStats: computeContentDiffStats(before.content ?? '', after.content ?? ''),
  };
}

export function hasExportStale(staleness: DraftStalenessAffected | undefined | null): boolean {
  return staleness?.export === true;
}

export function clearStalenessAffected(
  staleness: DraftStaleness | null | undefined,
  keys: (keyof DraftStalenessAffected)[],
): DraftStaleness | null {
  if (!staleness) return null;
  const affected = { ...staleness.affected };
  for (const key of keys) {
    affected[key] = false;
  }
  if (!Object.values(affected).some(Boolean)) {
    return null;
  }
  return { ...staleness, affected };
}

export function hasActiveStaleness(staleness: DraftStaleness | null | undefined): boolean {
  if (!staleness) return false;
  return Object.values(staleness.affected).some(Boolean);
}
