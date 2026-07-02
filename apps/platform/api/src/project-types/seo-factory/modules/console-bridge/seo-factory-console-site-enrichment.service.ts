/**
 * seo-factory Console 站点富化 Port。
 */

import { Injectable, OnModuleInit } from '@nestjs/common';
import type {
  ConsoleSiteEnrichmentInput,
  ConsoleSiteEnrichmentPort,
  ConsoleSiteEnrichmentResult,
} from '@wm/platform-sdk';
import { resolvePlanEntitlements } from '../../../../modules/billing/plan-entitlements.constants';
import { registerConsoleSiteEnrichmentPort } from '../../../../core/console/console-site-enrichment.registry';
import { siteHasWritingProfile } from '../../constants/site-settings';
import { buildSiteGscListSummary } from '../gsc/gsc-site-status.util';

@Injectable()
export class SeoFactoryConsoleSiteEnrichmentService
  implements ConsoleSiteEnrichmentPort, OnModuleInit
{
  readonly projectType = 'seo-factory';

  onModuleInit(): void {
    registerConsoleSiteEnrichmentPort(this);
  }

  enrichSite(input: ConsoleSiteEnrichmentInput): ConsoleSiteEnrichmentResult {
    const gscEnabled = resolvePlanEntitlements(input.organizationPlanName).gscEnabled;
    return {
      profileReady: siteHasWritingProfile(input.settings),
      gscEnabled,
      gsc: buildSiteGscListSummary(gscEnabled, input.gscConnection),
    };
  }
}
