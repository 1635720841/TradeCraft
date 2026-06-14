/**
 * 统一访问令牌校验：平台自建 JWT（后期可扩展 Logto Bearer）。
 *
 * 边界：
 * - 不负责：登录签发（AuthService）
 *
 * 入口：
 * - AuthTokenService
 */

import { Injectable } from '@nestjs/common';
import { JwtTokenService, type AccessTokenClaims } from './jwt-token.service';

@Injectable()
export class AuthTokenService {
  constructor(private readonly jwtTokenService: JwtTokenService) {}

  verifyAccessToken(token: string): AccessTokenClaims {
    return this.jwtTokenService.verifyAccessToken(token);
  }
}
