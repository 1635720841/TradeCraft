/**
 * Console 站点总览行映射。
 */

import { resolvePlanEntitlements } from '../billing/plan-entitlements.constants';
import { siteHasWritingProfile } from '../../project-types/seo-factory/constants/site-settings';
import {
  buildSiteGscListSummary,
  type SiteGscListSummary,
} from '../../project-types/seo-factory/modules/gsc/gsc-site-status.util';

export interface ConsoleSiteOverviewRow {
  siteId: string;
  domain: string;
  organizationId: string;
  organizationName: string;
  projectId: string;
  projectName: string;
  projectStatus: string;
  cmsType: string | null;
  cmsConfigured: boolean;
  profileReady: boolean;
  gscEnabled: boolean;
  gsc: SiteGscListSummary;
  jobCount: number;
  createdAt: string;
}

export type ConsoleSiteOverviewSource = {
  id: string;
  domain: string;
  organizationId: string;
  projectId: string;
  cmsType: string | null;
  cmsConfig: unknown;
  settings: unknown;
  createdAt: Date;
  project: {
    name: string;
    status: string;
    organization: { name: string; planName: string };
  };
  gscConnection: {
    propertyUrl: string | null;
    managedByPlatform: boolean;
    lastSyncAt: Date | null;
    lastSyncError: string | null;
  } | null;
  _count: { jobs: number };
};

export function mapConsoleSiteOverviewRow(site: ConsoleSiteOverviewSource): ConsoleSiteOverviewRow {
  const gscEnabled = resolvePlanEntitlements(site.project.organization.planName).gscEnabled;
  const cmsConfigured = Boolean(
    site.cmsType?.trim() && site.cmsConfig && typeof site.cmsConfig === 'object',
  );
  return {
    siteId: site.id,
    domain: site.domain,
    organizationId: site.organizationId,
    organizationName: site.project.organization.name,
    projectId: site.projectId,
    projectName: site.project.name,
    projectStatus: site.project.status,
    cmsType: site.cmsType,
    cmsConfigured,
    profileReady: siteHasWritingProfile(site.settings),
    gscEnabled,
    gsc: buildSiteGscListSummary(gscEnabled, site.gscConnection),
    jobCount: site._count.jobs,
    createdAt: site.createdAt.toISOString(),
  };
}
