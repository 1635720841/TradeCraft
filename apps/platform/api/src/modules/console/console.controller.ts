/**
 * 平台运营控制台 HTTP 入口（SUPER_ADMIN / PLATFORM_OPERATOR）。
 */

import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import type { RequestContext } from '@wm/shared-core';
import { Role } from '@wm/shared-core';
import { ReqCtx } from '../../core/decorators/request-context.decorator';
import { Permissions } from '../../core/decorators/permissions.decorator';
import { Roles } from '../../core/decorators/roles.decorator';
import { PermissionService } from '../access/permission.service';
import { AddQuotaTopUpDto } from '../billing/dto/add-quota-topup.dto';
import { ConsoleService } from './console.service';
import { ConsoleTenantService } from './console-tenant.service';
import { ConsoleAccessService } from './console-access.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { ImpersonateDto } from './dto/impersonate.dto';
import { SetUserMenusDto } from './dto/set-user-menus.dto';
import { SetUserPermissionsDto } from './dto/set-user-permissions.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';

@Controller('api/v1/console')
@Roles(Role.SUPER_ADMIN, Role.PLATFORM_OPERATOR)
export class ConsoleController {
  constructor(
    private readonly consoleService: ConsoleService,
    private readonly consoleTenantService: ConsoleTenantService,
    private readonly consoleAccessService: ConsoleAccessService,
    private readonly permissionService: PermissionService,
  ) {}

  @Get('overview')
  @Permissions('console:tenant:list')
  async getOverview(@ReqCtx() ctx: RequestContext) {
    const data = await this.consoleService.getOverview();
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Get('tenants')
  @Permissions('console:tenant:list')
  async listTenants(
    @ReqCtx() ctx: RequestContext,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('keyword') keyword?: string,
  ) {
    const result = await this.consoleTenantService.listTenants(
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
      keyword,
    );
    return {
      data: result.items,
      meta: {
        traceId: ctx.traceId,
        pagination: { page: result.page, limit: result.limit, total: result.total },
      },
    };
  }

  @Post('tenants')
  @Permissions('console:tenant:create')
  async createTenant(@ReqCtx() ctx: RequestContext, @Body() dto: CreateTenantDto) {
    const data = await this.consoleTenantService.createTenant(ctx.userId, ctx.traceId, dto);
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Get('tenants/:organizationId')
  @Permissions('console:tenant:read')
  async getTenant(
    @ReqCtx() ctx: RequestContext,
    @Param('organizationId') organizationId: string,
  ) {
    const data = await this.consoleTenantService.getTenant(organizationId);
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Patch('tenants/:organizationId')
  @Permissions('console:tenant:update')
  async updateTenant(
    @ReqCtx() ctx: RequestContext,
    @Param('organizationId') organizationId: string,
    @Body() dto: UpdateTenantDto,
  ) {
    const data = await this.consoleTenantService.updateTenant(
      ctx.userId,
      ctx.traceId,
      organizationId,
      dto,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Post('tenants/:organizationId/quota-topup')
  @Permissions('console:tenant:update')
  async addTenantQuotaTopUp(
    @ReqCtx() ctx: RequestContext,
    @Param('organizationId') organizationId: string,
    @Body() dto: AddQuotaTopUpDto,
  ) {
    const data = await this.consoleTenantService.addTenantQuotaTopUp(
      ctx.userId,
      ctx.traceId,
      organizationId,
      dto.amount,
      dto.note,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Post('tenants/:organizationId/renew')
  @Permissions('console:tenant:update')
  async renewTenant(
    @ReqCtx() ctx: RequestContext,
    @Param('organizationId') organizationId: string,
  ) {
    const data = await this.consoleTenantService.renewTenantPeriod(
      ctx.userId,
      ctx.traceId,
      organizationId,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Get('users')
  @Roles(Role.SUPER_ADMIN)
  @Permissions('console:menu:manage')
  async listUsers(
    @ReqCtx() ctx: RequestContext,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('keyword') keyword?: string,
  ) {
    const result = await this.consoleAccessService.listUsers(
      page ? Number(page) : 1,
      limit ? Number(limit) : 50,
      keyword,
    );
    return {
      data: result.items,
      meta: {
        traceId: ctx.traceId,
        pagination: { page: result.page, limit: result.limit, total: result.total },
      },
    };
  }

  @Get('users/:userId/permissions')
  @Roles(Role.SUPER_ADMIN)
  async getUserPermissions(@ReqCtx() ctx: RequestContext, @Param('userId') userId: string) {
    const data = await this.consoleAccessService.getUserPermissions(userId);
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Put('users/:userId/permissions')
  @Roles(Role.SUPER_ADMIN)
  async setUserPermissions(
    @ReqCtx() ctx: RequestContext,
    @Param('userId') userId: string,
    @Body() dto: SetUserPermissionsDto,
  ) {
    const data = await this.consoleAccessService.setUserPermissions(
      ctx.userId,
      ctx.role,
      ctx.permissions,
      userId,
      dto.permissionIds,
      ctx.traceId,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Get('users/:userId/menus')
  @Roles(Role.SUPER_ADMIN)
  @Permissions('console:menu:manage')
  async getUserMenus(@ReqCtx() ctx: RequestContext, @Param('userId') userId: string) {
    const data = await this.consoleAccessService.getUserMenus(userId);
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Put('users/:userId/menus')
  @Roles(Role.SUPER_ADMIN)
  @Permissions('console:menu:manage')
  async setUserMenus(
    @ReqCtx() ctx: RequestContext,
    @Param('userId') userId: string,
    @Body() dto: SetUserMenusDto,
  ) {
    const data = await this.consoleAccessService.setUserMenus(
      ctx.userId,
      ctx.traceId,
      userId,
      dto.menuIds,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Get('permissions')
  @Roles(Role.SUPER_ADMIN)
  listPermissions(@ReqCtx() ctx: RequestContext) {
    const data = this.permissionService.listCatalog();
    return { data, meta: { traceId: ctx.traceId, total: data.length } };
  }

  @Get('audit-logs')
  @Permissions('console:audit:read')
  async listAuditLogs(
    @ReqCtx() ctx: RequestContext,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('organizationId') organizationId?: string,
    @Query('actorUserId') actorUserId?: string,
    @Query('actorKeyword') actorKeyword?: string,
    @Query('action') action?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const result = await this.consoleService.listAuditLogs(
      page ? Number(page) : 1,
      limit ? Number(limit) : 50,
      organizationId,
      actorUserId,
      actorKeyword,
      action,
      dateFrom,
      dateTo,
    );
    return {
      data: result.items,
      meta: {
        traceId: ctx.traceId,
        pagination: { page: result.page, limit: result.limit, total: result.total },
      },
    };
  }

  @Get('billing-requests')
  @Permissions('console:tenant:update')
  async listBillingRequests(@ReqCtx() ctx: RequestContext) {
    const data = await this.consoleService.listBillingRequests();
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Post('billing-requests/:requestId/approve')
  @Permissions('console:tenant:update')
  async approveBillingRequest(
    @ReqCtx() ctx: RequestContext,
    @Param('requestId') requestId: string,
  ) {
    const data = await this.consoleService.approveBillingRequest(requestId, ctx.userId);
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Post('billing-requests/:requestId/reject')
  @Permissions('console:tenant:update')
  async rejectBillingRequest(
    @ReqCtx() ctx: RequestContext,
    @Param('requestId') requestId: string,
  ) {
    const data = await this.consoleService.rejectBillingRequest(requestId, ctx.userId);
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Post('impersonate')
  @Roles(Role.SUPER_ADMIN)
  async impersonate(@ReqCtx() ctx: RequestContext, @Body() dto: ImpersonateDto) {
    const data = await this.consoleService.impersonate(ctx.userId, ctx.traceId, dto);
    return { data, meta: { traceId: ctx.traceId } };
  }
}
