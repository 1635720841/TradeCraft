/**
 * Console 站点总览富化 Port：各 project-type 提供 GSC/素材等字段。
 */

export interface ConsoleSiteEnrichmentInput {
  settings: unknown;
  gscConnection: {
    propertyUrl: string | null;
    managedByPlatform: boolean;
    lastSyncAt: Date | null;
    lastSyncError: string | null;
  } | null;
  organizationPlanName: string;
}

export interface ConsoleSiteEnrichmentResult {
  profileReady: boolean;
  gscEnabled: boolean;
  gsc: {
    status: string;
    lastSyncAt: string | null;
    lastSyncError: string | null;
  };
}

export interface ConsoleSiteEnrichmentPort {
  readonly projectType: string;
  enrichSite(input: ConsoleSiteEnrichmentInput): ConsoleSiteEnrichmentResult;
}
