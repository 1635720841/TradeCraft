export interface SerpQuery {
  keyword: string;
  locale: string;
  country: string;
  organizationId?: string;
  projectId?: string;
}

export interface SerpResult {
  organic: unknown[];
  aiOverview?: unknown;
  fingerprint: string;
}

export interface ISerpProvider {
  fetchSerp(query: SerpQuery): Promise<SerpResult>;
}
