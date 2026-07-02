/**
 * Console 站点总览行映射。
 */

import { resolvePlanEntitlements } from '../billing/plan-entitlements.constants';
import { getConsoleSiteEnrichmentPort } from '../../core/console/console-site-enrichment.registry';

export interface ConsoleSiteGscSummary {
  status: string;
  lastSyncAt: string | null;
  lastSyncError: string | null;
}

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
  gsc: ConsoleSiteGscSummary;
  jobCount: number;
  createdAt: string;
}

export type ConsoleSiteOverviewSource = {
  id: string;
  domain: string;
  organizationId: string;
  projectId: string;
  projectType?: string;
  cmsType: string | null;
  cmsConfig: unknown;
  settings: unknown;
  createdAt: Date;
  project: {
    name: string;
    status: string;
    projectType?: string;
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
  const projectType = site.projectType ?? site.project.projectType ?? 'seo-factory';
  const port = getConsoleSiteEnrichmentPort(projectType);
  const enrichment = port?.enrichSite({
    settings: site.settings,
    gscConnection: site.gscConnection,
    organizationPlanName: site.project.organization.planName,
  });

  const gscEnabled =
    enrichment?.gscEnabled ??
    resolvePlanEntitlements(site.project.organization.planName).gscEnabled;
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
    profileReady: enrichment?.profileReady ?? false,
    gscEnabled,
    gsc: enrichment?.gsc ?? {
      status: gscEnabled ? 'unbound' : 'not_enabled',
      lastSyncAt: null,
      lastSyncError: null,
    },
    jobCount: site._count.jobs,
    createdAt: site.createdAt.toISOString(),
  };
}

