/**
 * 认证服务：登录、刷新令牌、用户同步。
 *
 * 边界：
 * - 不负责：Guard 注入（AuthGuard）
 *
 * 入口：
 * - AuthService
 */

import { Injectable } from '@nestjs/common';
import { scryptSync, timingSafeEqual } from 'node:crypto';
import { Role as PrismaRole } from '@prisma/client';
import { Role } from '@wm/shared-core';
import { PrismaService } from '../../core/database/prisma.service';
import { UnauthorizedException } from '../../core/exceptions/auth.exception';
import { ErrorCodes } from '../../core/exceptions/error-codes';
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

export interface AuthUserProfile {
  id: string;
  email: string;
  name: string | null;
  organizationId: string;
  role: Role;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtTokenService: JwtTokenService,
    private readonly logtoAuthService: LogtoAuthService,
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
      },
    });

    if (!user?.passwordHash || !this.verifyPassword(dto.password, user.passwordHash)) {
      throw new UnauthorizedException(ErrorCodes.UNAUTHORIZED, '用户名或密码错误');
    }

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
        passwordHash: true,
      },
    });

    if (!user) {
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
      },
    });

    if (!user) {
      throw new UnauthorizedException(ErrorCodes.UNAUTHORIZED, '用户不存在');
    }

    return { ...user, role: user.role as Role };
  }

  /** Logto 授权码换平台 JWT 会话 */
  async loginWithLogtoCode(code: string, redirectUri: string): Promise<AuthSessionPayload> {
    const identity = await this.logtoAuthService.exchangeAuthorizationCode(code, redirectUri);
    const user = await this.syncUserFromLogto(identity);
    return this.buildSession(user);
  }

  /** Logto 首次登录：按 authSubject 关联或创建 User + Organization */
  async syncUserFromLogto(identity: LogtoIdentity): Promise<{
    id: string;
    email: string;
    name: string | null;
    organizationId: string;
    role: PrismaRole;
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
      },
    });
    if (bySubject) {
      return bySubject;
    }

    const byEmail = await this.prisma.user.findFirst({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        organizationId: true,
        role: true,
      },
    });
    if (byEmail) {
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
        },
      });
    }

    const org = await this.prisma.organization.create({
      data: { name: `${email} 的企业` },
    });

    return this.prisma.user.create({
      data: {
        email,
        name: identity.name ?? email.split('@')[0],
        organizationId: org.id,
        role: PrismaRole.ADMIN,
        authSubject: identity.sub,
      },
      select: {
        id: true,
        email: true,
        name: true,
        organizationId: true,
        role: true,
      },
    });
  }

  /** 开发/首次登录：确保 Organization + User 存在（Logto 同步复用 syncUserFromLogto） */
  async ensureUserForEmail(input: {
    email: string;
    name?: string;
    organizationName?: string;
    role?: Role;
    password?: string;
  }): Promise<AuthUserProfile> {
    const email = input.email.trim().toLowerCase();
    const existing = await this.prisma.user.findFirst({
      where: { email },
      select: { id: true, email: true, name: true, organizationId: true, role: true },
    });
    if (existing) {
      return { ...existing, role: existing.role as Role };
    }

    const org = await this.prisma.organization.create({
      data: { name: input.organizationName ?? `${email} 的企业` },
    });

    const user = await this.prisma.user.create({
      data: {
        email,
        name: input.name ?? email.split('@')[0],
        organizationId: org.id,
        role: input.role ?? PrismaRole.ADMIN,
        passwordHash: input.password ? this.hashPassword(input.password) : null,
      },
      select: { id: true, email: true, name: true, organizationId: true, role: true },
    });

    return { ...user, role: user.role as Role };
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

  private buildSession(user: {
    id: string;
    email: string;
    name: string | null;
    organizationId: string;
    role: PrismaRole;
  }): AuthSessionPayload {
    const role = user.role as Role;
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
      permissions: role === Role.ADMIN ? ['*:*:*'] : [],
    };
  }
}
