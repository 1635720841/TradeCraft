/**
 * Console GSC 端口：平台层与 seo-factory 插件之间的契约。
 */

export const CONSOLE_GSC_PORT = Symbol('CONSOLE_GSC_PORT');

export interface PlatformGscStatus {
  oauthConfigured: boolean;
  platformConnected: boolean;
  googleEmail: string | null;
  connectedAt: string | null;
  propertyCount: number | null;
}

export interface ConsoleGscSiteRow {
  siteId: string;
  domain: string;
  organizationId: string;
  organizationName: string;
  projectId: string;
  projectName: string;
  connected: boolean;
  managedByPlatform: boolean;
  propertyUrl: string | null;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  gscEnabled: boolean;
}

export interface ConsoleGscPort {
  getPlatformStatus(): Promise<PlatformGscStatus>;
  createPlatformConnectUrl(connectedByUserId?: string): Promise<{ authUrl: string }>;
  disconnectPlatform(): Promise<{ disconnected: boolean }>;
  listConsoleSites(options?: {
    page?: number;
    limit?: number;
    keyword?: string;
    connected?: 'true' | 'false';
  }): Promise<{ items: ConsoleGscSiteRow[]; page: number; limit: number; total: number }>;
  autoConnectAllUnconnected(): Promise<{
    connected: number;
    failed: number;
    skipped: number;
    total: number;
  }>;
  connectConsoleSite(siteId: string): Promise<{ connected: boolean; reason?: string }>;
  disconnectConsoleSite(siteId: string): Promise<{ disconnected: boolean }>;
  syncConsoleSite(siteId: string): Promise<{ summary: unknown }>;
}
