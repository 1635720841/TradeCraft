/**
 * Semrush SWA SEO 关键词覆盖：正文 vs 目标词/推荐词，对齐侧栏绿/灰 Tag 逻辑。
 */

import type { SeoScore, SemrushActionableIssue } from '@wm/provider-interfaces';
import {
  findMissingSemrushKeywords,
  isSemrushKeywordPresentInContent,
  stripMarkdownForKeywordMatch,
} from '@wm/shared-core';
import { dedupeActionableIssues } from './semrush-actionable.util';

export { findMissingSemrushKeywords, isSemrushKeywordPresentInContent, stripMarkdownForKeywordMatch };

/** 9.5+ SWA 高分文章的关键词融合范式（供 LLM Prompt 引用） */
export const HIGH_SCORE_KEYWORD_WEAVING_EXEMPLARS = [
  '长尾问句作 H2：how can i get rid of blisters → ## How Can I Get Rid of Blisters on Feet?',
  '长尾问句作 H2：cure for blistered feet → ## Is There a Cure for Blistered Feet?',
  '症状口语化：teeth crunching → "hearing teeth crunching at night"',
  '患者感受：biting on teeth → "describe the feeling as biting on teeth"',
  '段内设问：what is grinding of teeth → "What is grinding of teeth? It is repeated rubbing..."',
  '实体词作 H2：blood blister → ## What Does a Blood Blister Look Like?',
] as const;

/** 语境化融合指令：引导 LLM 自然写入缺失 SEO 短语 */
export function buildContextualKeywordWeavingInstruction(missingKeywords: string[]): string {
  if (missingKeywords.length === 0) return '';

  const preview = missingKeywords.slice(0, 12).join(', ');
  const suffix = missingKeywords.length > 12 ? ` 等 ${missingKeywords.length} 个` : '';
  const exemplarBlock = HIGH_SCORE_KEYWORD_WEAVING_EXEMPLARS.map((line) => `- ${line}`).join('\n');

  return [
    `[SEO·语境融合·必做] 文章缺失核心 SEO 短语：${preview}${suffix}。`,
    '请不要将它们罗列为枯燥的列表或生硬的句子（禁止 "For procurement teams, relevant search terms include..."）。',
    '请采用以下自然方式之一将它们融入正文（每个短语仅需融合 1 次）：',
    '1) 将长尾词作为 H2/H3 问句标题（优先用于 ≥4 词的问句型短语）；',
    '2) 将口语化词汇作为患者主观感受或常见症状写进描述段落；',
    '3) 作为段内自然设问或定义句出现。',
    '',
    '9.5+ 高分样例（Foot Skin Blisters 9.6 / Magnesium Teeth Grinding 9.5）：',
    exemplarBlock,
  ].join('\n');
}

export function mergeSemrushKeywordLists(...lists: Array<string[] | undefined>): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();

  for (const list of lists) {
    for (const item of list ?? []) {
      const trimmed = item.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(trimmed);
    }
  }

  return merged;
}

export function buildSemrushKeywordActionableIssues(
  missingTarget: string[],
  missingRecommended: string[],
): SemrushActionableIssue[] {
  const issues: SemrushActionableIssue[] = [];

  if (missingTarget.length > 0) {
    issues.push({
      category: 'seo',
      rule: 'keyword',
      label: '目标关键词未覆盖',
      terms: missingTarget,
    });
  }

  if (missingRecommended.length > 0) {
    issues.push({
      category: 'seo',
      rule: 'keyword',
      label: '推荐关键词未覆盖',
      terms: missingRecommended,
    });
  }

  return issues;
}

export interface SemrushKeywordCoverageOptions {
  /** 创建任务时提交给 SWA 的主词/副词 */
  submittedKeywords?: string[];
  /** DOM SEO Tab 解析的未覆盖 Tag（可选，与正文比对结果合并） */
  domUncoveredKeywords?: string[];
}

/** 合并 API 词表 + 正文缺失检测 + actionableIssues */
export function enrichSemrushKeywordCoverage(
  result: SeoScore,
  content: string,
  options?: SemrushKeywordCoverageOptions,
): SeoScore {
  const targetKeywords = mergeSemrushKeywordLists(
    options?.submittedKeywords,
    result.semrushTargetKeywords,
  );
  const recommendedKeywords = result.semrushRecommendedKeywords ?? [];

  let missingTarget = findMissingSemrushKeywords(content, targetKeywords);
  let missingRecommended = findMissingSemrushKeywords(content, recommendedKeywords);

  for (const term of options?.domUncoveredKeywords ?? []) {
    const trimmed = term.trim();
    if (!trimmed) continue;
    if (targetKeywords.some((k) => k.toLowerCase() === trimmed.toLowerCase())) {
      if (!missingTarget.some((k) => k.toLowerCase() === trimmed.toLowerCase())) {
        missingTarget.push(trimmed);
      }
    } else if (!missingRecommended.some((k) => k.toLowerCase() === trimmed.toLowerCase())) {
      missingRecommended.push(trimmed);
    }
  }

  missingTarget = [...new Set(missingTarget)];
  missingRecommended = [...new Set(missingRecommended)];

  const keywordIssues = buildSemrushKeywordActionableIssues(missingTarget, missingRecommended);
  const actionableIssues =
    keywordIssues.length > 0
      ? dedupeActionableIssues([...(result.actionableIssues ?? []), ...keywordIssues])
      : result.actionableIssues;

  const seoLines = [...(result.suggestionDetails?.seo ?? [])];
  if (missingTarget.length > 0) {
    seoLines.push(`目标关键词未覆盖: ${missingTarget.join(', ')}`);
  }
  if (missingRecommended.length > 0) {
    const preview = missingRecommended.slice(0, 10).join(', ');
    const suffix = missingRecommended.length > 10 ? ` 等 ${missingRecommended.length} 个` : '';
    seoLines.push(`推荐关键词未覆盖: ${preview}${suffix}`);
  }

  const suggestionDetails =
    missingTarget.length > 0 || missingRecommended.length > 0
      ? {
          ...result.suggestionDetails,
          seo: [...new Set(seoLines)],
        }
      : result.suggestionDetails;

  return {
    ...result,
    semrushTargetKeywords: targetKeywords.length > 0 ? targetKeywords : result.semrushTargetKeywords,
    semrushMissingTargetKeywords: missingTarget.length > 0 ? missingTarget : undefined,
    semrushMissingRecommendedKeywords:
      missingRecommended.length > 0 ? missingRecommended : undefined,
    actionableIssues,
    suggestionDetails,
  };
}

/**
 * 收集正文中已命中的 SEO 短语（供可读性优化轮「关键词保护锁」使用）。
 */
export function collectPresentSeoPhrases(content: string, phrases: string[]): string[] {
  const present: string[] = [];
  const seen = new Set<string>();

  for (const phrase of phrases) {
    const trimmed = phrase.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (isSemrushKeywordPresentInContent(content, trimmed)) {
      present.push(trimmed);
    }
  }

  return present;
}
