/**
 * Console 站点行公共字段（GSC / 站点总览共用）。
 */

export interface ConsoleSiteRowBase {
  siteId: string;
  domain: string;
  organizationId: string;
  organizationName: string;
  projectId: string;
  projectName: string;
  gscEnabled: boolean;
}
