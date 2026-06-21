/**
 * 文章内容评分 API（改稿页 Semrush 式即时评分）。
 */

import { http } from "@/utils/http";
import type { ArticleJobContentScoreSnapshot } from "./types";
import type { WmApiResponse } from "./types";

export interface ArticleContentScoreResult {
  jobId: string;
  targetKeyword: string;
  contentScore?: ArticleJobContentScoreSnapshot;
  contentScore?: ArticleJobContentScoreSnapshot;
  overall: number;
  passed: boolean;
  passThreshold: number;
  pointsToGo: number;
  confidence: "high" | "medium" | "low";
  modelReady: boolean;
  evalMae: number | null;
  usedFallback: boolean;
  localScore: number;
  localBreakdown: {
    keywordCoverage: number;
    serpTermAlignment: number;
    structure: number;
    readability: number;
    contentDepth: number;
  };
  primaryNode: {
    key: string;
    label: string;
    hint: string;
  };
  missingKeywords: string[];
  missingKeywordCount: number;
  wordCount: {
    current: number;
    competitor: number | null;
    gap: number | null;
  };
  readability: {
    flesch: number | null;
    longSentencesOver22: number;
    longParagraphsOver65: number;
  };
  suggestions: string[];
  recommendedKeywords: string[];
  featureAttribution: Array<{
    key: string;
    label: string;
    contribution: number;
    featureValue: number;
    meanValue: number;
    direction: "raises" | "lowers";
  }>;
}

/** 对任务稿件正文做内容评分（秒级，不跑 Semrush RPA） */
export async function scoreArticleJobContent(
  projectId: string,
  jobId: string,
  payload: {
    content: string;
    submittedKeywords?: string[];
    competitorWordCount?: number;
  }
): Promise<ArticleContentScoreResult> {
  const res = await http.request<WmApiResponse<ArticleContentScoreResult>>(
    "post",
    `/api/v1/projects/${projectId}/article-jobs/${jobId}/content-score`,
    { data: payload }
  );
  return res.data;
}

/** 无任务上下文试算内容分（管理端，不写库） */
export async function scoreArticleContentTrial(
  projectId: string,
  payload: {
    targetKeyword: string;
    content: string;
    submittedKeywords?: string[];
    targetWordCount?: number;
    competitorWordCount?: number;
  }
): Promise<Omit<ArticleContentScoreResult, "jobId" | "contentScore">> {
  const res = await http.request<
    WmApiResponse<Omit<ArticleContentScoreResult, "jobId" | "contentScore">>
  >("post", `/api/v1/projects/${projectId}/content-score/trial`, { data: payload });
  return res.data;
}
