/**
 * 站点租户范围校验（orgId + projectId + siteId）。
 */

import type { PrismaService } from '../../../core/database/prisma.service';
import { BusinessException } from '../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../core/exceptions/error-codes';

export async function assertSiteScope(
  prisma: Pick<PrismaService, 'site'>,
  organizationId: string,
  projectId: string,
  siteId: string,
  options?: { selectDomain?: boolean },
) {
  const site = await prisma.site.findFirst({
    where: { id: siteId, organizationId, projectId },
    select: options?.selectDomain
      ? { id: true, domain: true }
      : { id: true },
  });

  if (!site) {
    throw new BusinessException(ErrorCodes.SITE_NOT_FOUND, '站点不存在');
  }

  return site;
}
