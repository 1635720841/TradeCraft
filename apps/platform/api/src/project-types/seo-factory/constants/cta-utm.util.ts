/** CTA UTM 拼接与 Inquiry HTML 导出块 */

export interface CtaUtmParams {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
}

export function parseCtaUtmParams(raw: unknown): CtaUtmParams | undefined {
  if (!raw || typeof raw !== 'object') return undefined;

  const record = raw as Record<string, unknown>;
  const params: CtaUtmParams = {};

  for (const key of ['utmSource', 'utmMedium', 'utmCampaign', 'utmContent'] as const) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      params[key] = value.trim();
    }
  }

  return Object.keys(params).length > 0 ? params : undefined;
}

export function appendUtmToUrl(
  baseUrl: string,
  params: CtaUtmParams,
  keyword?: string,
): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) return trimmed;

  try {
    const url = new URL(trimmed);
    if (params.utmSource) url.searchParams.set('utm_source', params.utmSource);
    if (params.utmMedium) url.searchParams.set('utm_medium', params.utmMedium);
    if (params.utmCampaign) url.searchParams.set('utm_campaign', params.utmCampaign);
    if (params.utmContent) url.searchParams.set('utm_content', params.utmContent);
    if (keyword?.trim() && !url.searchParams.has('utm_term')) {
      url.searchParams.set('utm_term', keyword.trim());
    }
    return url.toString();
  } catch {
    return trimmed;
  }
}

export function buildInquiryHtmlBlock(ctaText: string, ctaUrl: string): string {
  const text = escapeHtml(ctaText.trim());
  const href = escapeHtml(ctaUrl.trim());
  if (!text || !href) return '';

  return `
<section class="inquiry-cta" style="margin-top:2.5rem;padding:1.5rem;border:1px solid #e5e7eb;border-radius:0.5rem;background:#f9fafb;">
  <h2 style="margin:0 0 0.75rem;font-size:1.25rem;">Request a Quote</h2>
  <p style="margin:0 0 1rem;color:#374151;">${text}</p>
  <a href="${href}" style="display:inline-block;padding:0.6rem 1.25rem;background:#2563eb;color:#fff;text-decoration:none;border-radius:0.375rem;font-weight:600;">Contact Us</a>
</section>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
