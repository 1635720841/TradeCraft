/**
 * SEO 评分面板纯展示格式化（从 ArticleJobSeoScorePanel 抽出）。
 */
import type { ArticleJobOptimizeRound } from "@/api/seo-factory/types";

export function formatRoundScore(
  score: number | null | undefined,
  phase: ArticleJobOptimizeRound["phase"]
): string {
  if (score == null) return "-";
  return phase === "local" ? `${score} / 100` : `${score} / 10`;
}

export function formatPredictedSemrush(score: number | null | undefined): string {
  if (score == null) return "-";
  return `${Math.round(score * 100) / 100} / 10`;
}

export function formatDelta(delta: number): string {
  const rounded = Math.round(delta * 100) / 100;
  if (rounded > 0) return `+${rounded}`;
  return String(rounded);
}

export function formatSeoScoreTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}
