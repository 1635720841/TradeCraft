/**
 * 平台角色访问 /projects/:projectId/* 时，将 RequestContext.organizationId
 * 解析为项目所属企业，避免 Service 层用平台 org 查租户数据。
 */

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, from, switchMap } from 'rxjs';
import {
  attachRequestContext,
  readRequestContext,
} from '../context/request-context.store';
import { PrismaService } from '../database/prisma.service';
import {
  isPlatformConsoleActor,
  lookupProjectOrganizationId,
} from '../../modules/project/project-tenant-scope.util';

@Injectable()
export class ProjectTenantScopeInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Record<string, unknown>>();
    const reqCtx = readRequestContext(request);
    if (!reqCtx) {
      return next.handle();
    }

    const params = request.params as Record<string, string> | undefined;
    const projectId = params?.projectId;
    if (!projectId || !isPlatformConsoleActor(reqCtx.role)) {
      return next.handle();
    }

    return from(lookupProjectOrganizationId(this.prisma, projectId)).pipe(
      switchMap((tenantOrganizationId) => {
        if (tenantOrganizationId && tenantOrganizationId !== reqCtx.organizationId) {
          attachRequestContext(request, {
            ...reqCtx,
            organizationId: tenantOrganizationId,
          });
        }
        return next.handle();
      }),
    );
  }
}
