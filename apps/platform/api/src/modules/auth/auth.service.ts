/**
 * 认证服务：登录、刷新令牌、用户同步。
 */

import { Injectable } from '@nestjs/common';
import { scryptSync, timingSafeEqual } from 'node:crypto';
import { Role as PrismaRole } from '@prisma/client';
import { Role, type OrganizationType } from '@wm/shared-core';
import { PrismaService } from '../../core/database/prisma.service';
import { UnauthorizedException } from '../../core/exceptions/auth.exception';
import { ErrorCodes } from '../../core/exceptions/error-codes';
import { MenuService } from '../access/menu.service';
import { PermissionService } from '../access/permission.service';
import {
  buildTenantAccessMeta,
  sanitizeTenantUserGrants,
  type PermissionDefinition,
} from '../access/permission.constants';
import { AuditService } from '../access/audit.service';
import { JwtTokenService } from './jwt-token.service';
import type { LoginDto } from './dto/login.dto';
import { LogtoAuthService, type LogtoIdentity } from './logto/logto-auth.service';
import { isLocalLoginAllowed } from './logto/logto.config';

export interface AuthSessionPayload {
  accessToken: string;
  refreshToken: string;
  expires: string;
  username: string;
  nickname: string;
  avatar: string;
  roles: string[];
  permissions: string[];
}

export interface AuthAccessMeta {
  permissionCatalog: PermissionDefinition[];
  roleDefaultPermissions: Record<string, string[]>;
  permissionImplies: Record<string, string[]>;
}

export interface AuthUserProfile {
  id: string;
  email: string;
  name: string | null;
  organizationId: string;
  organizationType: OrganizationType;
  role: Role;
  permissions: string[];
  grants: string[];
  visibleMenuKeys: string[];
  accessMeta: AuthAccessMeta;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtTokenService: JwtTokenService,
    private readonly logtoAuthService: LogtoAuthService,
    private readonly permissionService: PermissionService,
    private readonly menuService: MenuService,
    private readonly auditService: AuditService,
  ) {}

  async login(dto: LoginDto): Promise<AuthSessionPayload> {
    if (!isLocalLoginAllowed()) {
      throw new UnauthorizedException(ErrorCodes.UNAUTHORIZED, '本地密码登录已关闭，请使用 Logto 登录');
    }
    const email = this.resolveLoginEmail(dto.username);
    const user = await this.prisma.user.findFirst({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        organizationId: true,
        role: true,
        passwordHash: true,
        status: true,
      },
    });

    if (!user?.passwordHash || !this.verifyPassword(dto.password, user.passwordHash)) {
      throw new UnauthorizedException(ErrorCodes.UNAUTHORIZED, '用户名或密码错误');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException(ErrorCodes.UNAUTHORIZED, '账号未激活或已禁用');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await this.auditService.log({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'auth.login',
      targetType: 'User',
      targetId: user.id,
      metadata: { method: 'password' },
    });

    return this.buildSession(user);
  }

  async refresh(refreshToken: string): Promise<AuthSessionPayload> {
    const claims = this.jwtTokenService.verifyRefreshToken(refreshToken);
    const user = await this.prisma.user.findFirst({
      where: { id: claims.sub, organizationId: claims.org },
      select: {
        id: true,
        email: true,
        name: true,
        organizationId: true,
        role: true,
        status: true,
      },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException(ErrorCodes.UNAUTHORIZED, '用户不存在或已被移除');
    }

    return this.buildSession(user);
  }

  async getProfile(userId: string, organizationId: string): Promise<AuthUserProfile> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId },
      select: {
        id: true,
        email: true,
        name: true,
        organizationId: true,
        role: true,
        organization: { select: { type: true } },
      },
    });

    if (!user) {
      throw new UnauthorizedException(ErrorCodes.UNAUTHORIZED, '用户不存在');
    }

    return this.buildUserProfile(user);
  }

  async loginWithLogtoCode(
    code: string,
    redirectUri: string,
    inviteToken?: string,
  ): Promise<AuthSessionPayload> {
    const identity = await this.logtoAuthService.exchangeAuthorizationCode(code, redirectUri);
    const user = await this.syncUserFromLogto(identity, inviteToken);

    if (user.status && user.status !== 'ACTIVE') {
      throw new UnauthorizedException(ErrorCodes.UNAUTHORIZED, '账号未激活或已禁用');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await this.auditService.log({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'auth.login',
      targetType: 'User',
      targetId: user.id,
      metadata: { method: 'logto' },
    });

    return this.buildSession(user);
  }

  async syncUserFromLogto(
    identity: LogtoIdentity,
    inviteToken?: string,
  ): Promise<{
    id: string;
    email: string;
    name: string | null;
    organizationId: string;
    role: PrismaRole;
    status?: string;
  }> {
    const email = identity.email.trim().toLowerCase();

    const bySubject = await this.prisma.user.findFirst({
      where: { authSubject: identity.sub },
      select: {
        id: true,
        email: true,
        name: true,
        organizationId: true,
        role: true,
        status: true,
      },
    });
    if (bySubject) {
      if (bySubject.status !== 'ACTIVE') {
        throw new UnauthorizedException(ErrorCodes.UNAUTHORIZED, '账号未激活或已禁用');
      }
      return bySubject;
    }

    const pendingInvite = inviteToken
      ? await this.findInviteByToken(inviteToken)
      : await this.prisma.memberInvite.findFirst({
          where: {
            email,
            revokedAt: null,
            acceptedAt: null,
            expiresAt: { gt: new Date() },
          },
          orderBy: { createdAt: 'desc' },
        });

    if (pendingInvite) {
      if (pendingInvite.email !== email) {
        throw new UnauthorizedException(ErrorCodes.UNAUTHORIZED, '邀请邮箱与登录账号不一致');
      }

      const user = await this.prisma.user.findFirst({
        where: { email, organizationId: pendingInvite.organizationId },
        select: {
          id: true,
          email: true,
          name: true,
          organizationId: true,
          role: true,
          status: true,
        },
      });

      if (!user) {
        throw new UnauthorizedException(ErrorCodes.UNAUTHORIZED, '邀请用户不存在');
      }

      await this.prisma.$transaction([
        this.prisma.memberInvite.update({
          where: { id: pendingInvite.id },
          data: { acceptedAt: new Date() },
        }),
        this.prisma.user.update({
          where: { id: user.id },
          data: {
            authSubject: identity.sub,
            name: user.name ?? identity.name ?? null,
            status: 'ACTIVE',
          },
        }),
      ]);

      return { ...user, status: 'ACTIVE' };
    }

    const byEmail = await this.prisma.user.findFirst({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        organizationId: true,
        role: true,
        status: true,
      },
    });
    if (byEmail) {
      if (byEmail.status === 'INVITED') {
        throw new UnauthorizedException(
          ErrorCodes.UNAUTHORIZED,
          '请先通过邀请邮件中的链接接受邀请',
        );
      }
      if (byEmail.status !== 'ACTIVE') {
        throw new UnauthorizedException(ErrorCodes.UNAUTHORIZED, '账号未激活或已禁用');
      }
      return this.prisma.user.update({
        where: { id: byEmail.id },
        data: {
          authSubject: identity.sub,
          name: byEmail.name ?? identity.name ?? null,
        },
        select: {
          id: true,
          email: true,
          name: true,
          organizationId: true,
          role: true,
          status: true,
        },
      });
    }

    const org = await this.prisma.organization.create({
      data: { name: `${email} 的企业`, type: 'CUSTOMER' },
    });

    return this.prisma.user.create({
      data: {
        email,
        name: identity.name ?? email.split('@')[0],
        organizationId: org.id,
        role: PrismaRole.ADMIN,
        authSubject: identity.sub,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        email: true,
        name: true,
        organizationId: true,
        role: true,
        status: true,
      },
    });
  }

  private async findInviteByToken(rawToken: string) {
    const { createHash } = await import('node:crypto');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    return this.prisma.memberInvite.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
  }

  async ensureUserForEmail(input: {
    email: string;
    name?: string;
    organizationName?: string;
    organizationType?: 'CUSTOMER' | 'PLATFORM';
    role?: Role;
    password?: string;
  }): Promise<AuthUserProfile> {
    const email = input.email.trim().toLowerCase();
    const existing = await this.prisma.user.findFirst({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        organizationId: true,
        role: true,
        organization: { select: { type: true } },
      },
    });
    if (existing) {
      return this.buildUserProfile(existing);
    }

    const org = await this.prisma.organization.create({
      data: {
        name: input.organizationName ?? `${email} 的企业`,
        type: input.organizationType ?? 'CUSTOMER',
      },
    });

    const user = await this.prisma.user.create({
      data: {
        email,
        name: input.name ?? email.split('@')[0],
        organizationId: org.id,
        role: (input.role ?? Role.ADMIN) as PrismaRole,
        passwordHash: input.password ? this.hashPassword(input.password) : null,
      },
      select: {
        id: true,
        email: true,
        name: true,
        organizationId: true,
        role: true,
        organization: { select: { type: true } },
      },
    });

    return this.buildUserProfile(user);
  }

  hashPassword(password: string): string {
    const salt = scryptSync(password, 'wm-auth-salt', 16);
    const hash = scryptSync(password, salt, 64);
    return `${salt.toString('hex')}:${hash.toString('hex')}`;
  }

  private resolveLoginEmail(username: string): string {
    const normalized = username.trim().toLowerCase();
    if (normalized === 'admin') {
      return 'admin@dev.local';
    }
    if (normalized === 'super' || normalized === 'superadmin') {
      return 'super@dev.local';
    }
    if (normalized === 'ops' || normalized === 'operator') {
      return 'ops@dev.local';
    }
    if (normalized === 'member') {
      return 'member@dev.local';
    }
    return normalized;
  }

  private verifyPassword(password: string, stored: string): boolean {
    const [saltHex, hashHex] = stored.split(':');
    if (!saltHex || !hashHex) {
      return false;
    }
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const actual = scryptSync(password, salt, 64);
    if (expected.length !== actual.length) {
      return false;
    }
    return timingSafeEqual(expected, actual);
  }

  private async buildUserProfile(user: {
    id: string;
    email: string;
    name: string | null;
    organizationId: string;
    role: PrismaRole;
    organization: { type: string };
  }): Promise<AuthUserProfile> {
    const role = user.role as Role;
    const permissions = await this.permissionService.resolveUserPermissions(user.id, role);
    const [rawGrants, visibleMenuKeys] = await Promise.all([
      this.permissionService.getUserPermissionIds(user.id),
      this.menuService.resolveVisibleMenuKeys(user.id, role, permissions),
    ]);
    const grants =
      role === Role.ADMIN || role === Role.MEMBER
        ? sanitizeTenantUserGrants(rawGrants)
        : rawGrants;

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      organizationId: user.organizationId,
      organizationType: user.organization.type === 'PLATFORM' ? 'PLATFORM' : 'CUSTOMER',
      role,
      permissions,
      grants,
      visibleMenuKeys,
      accessMeta: buildTenantAccessMeta(),
    };
  }

  private async buildSession(user: {
    id: string;
    email: string;
    name: string | null;
    organizationId: string;
    role: PrismaRole;
  }): Promise<AuthSessionPayload> {
    const role = user.role as Role;
    const permissions = await this.permissionService.resolveUserPermissions(user.id, role);
    const tokenInput = {
      userId: user.id,
      organizationId: user.organizationId,
      role,
    };
    const accessToken = this.jwtTokenService.signAccessToken(tokenInput);
    const refreshToken = this.jwtTokenService.signRefreshToken(tokenInput);
    const expires = this.jwtTokenService.getAccessExpiresAt().toISOString();

    return {
      accessToken,
      refreshToken,
      expires,
      username: user.email,
      nickname: user.name ?? user.email,
      avatar: '',
      roles: [role.toLowerCase()],
      permissions,
    };
  }
}
