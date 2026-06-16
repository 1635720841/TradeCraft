export interface SerpQuery {
  keyword: string;
  locale: string;
  country: string;
  organizationId?: string;
  projectId?: string;
  /** Google 有机结果条数（默认由适配器决定） */
  num?: number;
  /** 搜索缓存 TTL（秒），0 或不传表示不缓存 */
  cacheTtlSeconds?: number;
  /** 跳过读缓存，仍可按 TTL 回写（用于手动刷新） */
  bypassCache?: boolean;
}

export interface SerpResult {
  organic: unknown[];
  aiOverview?: unknown;
  fingerprint: string;
  fromCache?: boolean;
}

export interface ISerpProvider {
  fetchSerp(query: SerpQuery): Promise<SerpResult>;
}
