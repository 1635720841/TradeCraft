/**
 * JWT 签发与校验（HS256，开发/自建 Auth；后期可换 Logto JWKS）。
 *
 * 边界：
 * - 不负责：用户查询（AuthService）
 *
 * 入口：
 * - JwtTokenService
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Role } from '@wm/shared-core';
import { UnauthorizedException } from '../../core/exceptions/auth.exception';
import { ErrorCodes } from '../../core/exceptions/error-codes';

export interface AccessTokenClaims {
  sub: string;
  org: string;
  role: Role;
  type: 'access';
  exp: number;
  iat: number;
}

export interface RefreshTokenClaims {
  sub: string;
  org: string;
  role: Role;
  type: 'refresh';
  exp: number;
  iat: number;
}

export type TokenClaims = AccessTokenClaims | RefreshTokenClaims;

const ACCESS_TTL_SEC = 2 * 60 * 60;
const REFRESH_TTL_SEC = 30 * 24 * 60 * 60;

@Injectable()
export class JwtTokenService {
  private readonly secret = this.resolveSecret();

  signAccessToken(input: { userId: string; organizationId: string; role: Role }): string {
    const now = Math.floor(Date.now() / 1000);
    return this.sign({
      sub: input.userId,
      org: input.organizationId,
      role: input.role,
      type: 'access',
      iat: now,
      exp: now + ACCESS_TTL_SEC,
    });
  }

  signRefreshToken(input: { userId: string; organizationId: string; role: Role }): string {
    const now = Math.floor(Date.now() / 1000);
    return this.sign({
      sub: input.userId,
      org: input.organizationId,
      role: input.role,
      type: 'refresh',
      iat: now,
      exp: now + REFRESH_TTL_SEC,
    });
  }

  verifyAccessToken(token: string): AccessTokenClaims {
    const claims = this.verify(token);
    if (claims.type !== 'access') {
      throw new UnauthorizedException(ErrorCodes.UNAUTHORIZED, '无效的访问令牌');
    }
    return claims;
  }

  verifyRefreshToken(token: string): RefreshTokenClaims {
    const claims = this.verify(token);
    if (claims.type !== 'refresh') {
      throw new UnauthorizedException(ErrorCodes.UNAUTHORIZED, '无效的刷新令牌');
    }
    return claims;
  }

  getAccessExpiresAt(): Date {
    return new Date(Date.now() + ACCESS_TTL_SEC * 1000);
  }

  getRefreshExpiresAt(): Date {
    return new Date(Date.now() + REFRESH_TTL_SEC * 1000);
  }

  private sign(payload: TokenClaims): string {
    const header = this.base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = this.base64Url(JSON.stringify(payload));
    const signature = this.signSegment(`${header}.${body}`);
    return `${header}.${body}.${signature}`;
  }

  private verify(token: string): TokenClaims {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new UnauthorizedException(ErrorCodes.UNAUTHORIZED, '令牌格式无效');
    }

    const [header, body, signature] = parts;
    const expected = this.signSegment(`${header}.${body}`);
    if (!this.safeEqual(signature, expected)) {
      throw new UnauthorizedException(ErrorCodes.UNAUTHORIZED, '令牌签名无效');
    }

    let claims: TokenClaims;
    try {
      claims = JSON.parse(this.fromBase64Url(body)) as TokenClaims;
    } catch {
      throw new UnauthorizedException(ErrorCodes.UNAUTHORIZED, '令牌载荷无效');
    }

    const now = Math.floor(Date.now() / 1000);
    if (!claims.exp || claims.exp <= now) {
      throw new UnauthorizedException(ErrorCodes.UNAUTHORIZED, '登录已过期，请重新登录');
    }

    if (!claims.sub || !claims.org || !claims.role) {
      throw new UnauthorizedException(ErrorCodes.UNAUTHORIZED, '令牌缺少必要字段');
    }

    return claims;
  }

  private signSegment(data: string): string {
    return this.base64Url(createHmac('sha256', this.secret).update(data).digest());
  }

  private base64Url(input: string | Buffer): string {
    return Buffer.from(input).toString('base64url');
  }

  private fromBase64Url(input: string): string {
    return Buffer.from(input, 'base64url').toString('utf8');
  }

  private safeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  }

  private resolveSecret(): string {
    const secret = process.env.AUTH_JWT_SECRET?.trim();
    if (secret && secret.length >= 16) {
      return secret;
    }
    if (process.env.NODE_ENV === 'production') {
      throw new Error('生产环境必须设置 AUTH_JWT_SECRET（至少 16 字符）');
    }
    return 'wm-dev-jwt-secret-change-me';
  }
}
