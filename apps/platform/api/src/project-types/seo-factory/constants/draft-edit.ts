/** 手动编辑历史最多保留条数 */
export const MANUAL_EDIT_HISTORY_MAX = 20;

/** 正文大改阈值：字符差异占比 ≥ 此值视为大改（内链/配图标记 stale） */
export const CONTENT_MAJOR_CHANGE_RATIO = 0.1;

export type DraftPostSaveAction = 'none' | 'refresh_local' | 'rerun_from_optimizing';

/** 编辑后手动消除 stale 标记（Banner 快捷操作） */
export type DraftResolveStaleAction = 'refresh_local' | 'rerun_semrush' | 'regenerate_export';

export interface DraftStalenessAffected {
  localSeo: boolean;
  semrush: boolean;
  paraphrase: boolean;
  ymyl: boolean;
  export: boolean;
  internalLinks: boolean;
  images: boolean;
}

export interface DraftStaleness {
  contentChanged: boolean;
  titleMetaChanged: boolean;
  invalidatedAt: string;
  invalidatedBy: string;
  affected: DraftStalenessAffected;
  postSaveAction?: DraftPostSaveAction;
}

export interface ManualEditChangeSummary {
  titleChanged: boolean;
  metaChanged: boolean;
  contentDiffStats: {
    added: number;
    removed: number;
    charsBefore: number;
    charsAfter: number;
  };
}

export interface ManualEditHistoryEntry {
  id: string;
  editedAt: string;
  editedBy: string;
  changeSummary: ManualEditChangeSummary;
  snapshot: {
    title?: string;
    metaDescription?: string;
    content: string;
  };
  postSaveAction: DraftPostSaveAction;
  staleness: DraftStalenessAffected;
}

export const EDITABLE_JOB_STATUSES = [
  'DRAFTING',
  'LINKING',
  'ILLUSTRATING',
  'OPTIMIZING',
  'REVIEWING',
  'COMPLETED',
  'FAILED',
] as const;

export type EditableJobStatus = (typeof EDITABLE_JOB_STATUSES)[number];
