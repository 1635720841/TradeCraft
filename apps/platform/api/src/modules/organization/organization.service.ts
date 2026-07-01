/**
 * 企业服务：组织信息与成员管理（租户内）。
 *
 * 边界：编排委托 OrganizationProfileService / OrganizationMemberService，本类不承载业务逻辑。
 */

import { Injectable } from '@nestjs/common';
import { Role } from '@wm/shared-core';
import type { UpdateTenantDto } from '../console/dto/update-tenant.dto';
import type { CreateMemberDto } from './dto/create-member.dto';
import type { UpdateMemberDto } from './dto/update-member.dto';
import type { UpdateMemberStatusDto } from './dto/update-member-status.dto';
import type { UpdateOrgProfileDto } from './dto/update-org-profile.dto';
import { OrganizationMemberService } from './organization-member.service';
import { OrganizationProfileService } from './organization-profile.service';

@Injectable()
export class OrganizationService {
  constructor(
    private readonly organizationProfileService: OrganizationProfileService,
    private readonly organizationMemberService: OrganizationMemberService,
  ) {}

  getProfile(organizationId: string, viewerRole?: Role) {
    return this.organizationProfileService.getProfile(organizationId, viewerRole);
  }

  updateProfile(
    organizationId: string,
    actorUserId: string,
    traceId: string,
    dto: UpdateOrgProfileDto,
  ) {
    return this.organizationProfileService.updateProfile(
      organizationId,
      actorUserId,
      traceId,
      dto,
    );
  }

  updateTenant(organizationId: string, dto: UpdateTenantDto) {
    return this.organizationProfileService.updateTenant(organizationId, dto);
  }

  listMembers(
    organizationId: string,
    viewerRole?: Role,
    options?: { page?: number; limit?: number },
  ) {
    return this.organizationMemberService.listMembers(organizationId, viewerRole, options);
  }

  createMember(
    organizationId: string,
    actorUserId: string,
    traceId: string,
    dto: CreateMemberDto,
  ) {
    return this.organizationMemberService.createMember(
      organizationId,
      actorUserId,
      traceId,
      dto,
    );
  }

  updateMember(
    organizationId: string,
    actorUserId: string,
    traceId: string,
    userId: string,
    dto: UpdateMemberDto,
  ) {
    return this.organizationMemberService.updateMember(
      organizationId,
      actorUserId,
      traceId,
      userId,
      dto,
    );
  }

  updateMemberStatus(
    organizationId: string,
    actorUserId: string,
    traceId: string,
    userId: string,
    status: UpdateMemberStatusDto['status'],
  ) {
    return this.organizationMemberService.updateMemberStatus(
      organizationId,
      actorUserId,
      traceId,
      userId,
      status,
    );
  }

  removeMember(
    organizationId: string,
    actorUserId: string,
    traceId: string,
    userId: string,
  ) {
    return this.organizationMemberService.removeMember(
      organizationId,
      actorUserId,
      traceId,
      userId,
    );
  }

  getMemberPermissions(organizationId: string, userId: string, viewerRole?: Role) {
    return this.organizationMemberService.getMemberPermissions(
      organizationId,
      userId,
      viewerRole,
    );
  }

  setMemberPermissions(
    organizationId: string,
    actorUserId: string,
    actorRole: Role,
    actorPermissions: readonly string[],
    targetUserId: string,
    permissionIds: string[],
    traceId: string,
  ) {
    return this.organizationMemberService.setMemberPermissions(
      organizationId,
      actorUserId,
      actorRole,
      actorPermissions,
      targetUserId,
      permissionIds,
      traceId,
    );
  }
}
