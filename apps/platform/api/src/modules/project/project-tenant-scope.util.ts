/**
 * 平台 Console 跨企业访问项目时，将 JWT 中的平台 org 解析为项目所属企业 org。
 */

import { Role } from '@wm/shared-core';
import { BusinessException } from '../../core/exceptions/business.exception';
import { ErrorCodes } from '../../core/exceptions/error-codes';

type ProjectOrgLookup = {
  project: {
    findFirst: (args: {
      where: { id: string };
      select: { organizationId: true };
    }) => Promise<{ organizationId: string } | null>;
  };
};

export function isPlatformConsoleActor(role?: Role): boolean {
  return role === Role.SUPER_ADMIN || role === Role.PLATFORM_OPERATOR;
}

export async function resolveProjectOrganizationId(
  prisma: ProjectOrgLookup,
  organizationId: string,
  projectId: string,
  actor?: { role?: Role },
): Promise<string> {
  if (!actor || !isPlatformConsoleActor(actor.role)) {
    return organizationId;
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId },
    select: { organizationId: true },
  });
  if (!project) {
    throw new BusinessException(ErrorCodes.NOT_FOUND, '项目不存在');
  }
  return project.organizationId;
}

/** 拦截器用：项目不存在时不抛错，由后续 assert 处理 */
export async function lookupProjectOrganizationId(
  prisma: ProjectOrgLookup,
  projectId: string,
): Promise<string | undefined> {
  const project = await prisma.project.findFirst({
    where: { id: projectId },
    select: { organizationId: true },
  });
  return project?.organizationId;
}
