/** 站点 UTM 归因 CSV 导出 */

import {
  appendUtmToUrl,
  parseCtaUtmParams,
  type CtaUtmParams,
} from '../../constants/cta-utm.util';
import { parseSiteSettings } from '../../constants/site-settings';

export interface AttributionExportRow {
  jobId: string;
  keyword: string;
  postUrl: string;
  ctaUrl: string;
  publishedAt: string;
}

function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildAttributionCsv(rows: AttributionExportRow[]): string {
  const header = ['job_id', 'keyword', 'post_url', 'cta_url_with_utm', 'published_at'];
  const lines = [
    header.join(','),
    ...rows.map((row) =>
      [
        row.jobId,
        row.keyword,
        row.postUrl,
        row.ctaUrl,
        row.publishedAt,
      ]
        .map((cell) => escapeCsvField(cell))
        .join(','),
    ),
  ];
  return `${lines.join('\n')}\n`;
}

export function resolveAttributionRows(
  jobs: Array<{
    id: string;
    targetKeyword: string;
    seoCheckData: unknown;
    updatedAt: Date;
  }>,
  siteSettings: unknown,
): AttributionExportRow[] {
  const parsed = parseSiteSettings(siteSettings);
  const profile = parsed.contentProfile;
  const utmParams: CtaUtmParams = parseCtaUtmParams(profile) ?? {};
  const ctaBaseUrl = profile?.ctaPrimaryUrl?.trim() ?? '';

  const rows: AttributionExportRow[] = [];

  for (const job of jobs) {
    const cms = (job.seoCheckData as { cmsPublish?: { postUrl?: string | null; publishedAt?: string | null } } | null)
      ?.cmsPublish;
    const postUrl = cms?.postUrl?.trim() ?? '';
    if (!postUrl) continue;

    const ctaUrl = ctaBaseUrl
      ? appendUtmToUrl(ctaBaseUrl, utmParams, job.targetKeyword)
      : '';

    rows.push({
      jobId: job.id,
      keyword: job.targetKeyword,
      postUrl,
      ctaUrl,
      publishedAt: cms?.publishedAt ?? job.updatedAt.toISOString(),
    });
  }

  return rows;
}
