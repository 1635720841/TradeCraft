/**
 * 认证模块：登录、JWT 签发与用户查询。
 *
 * 边界：
 * - 不负责：全局 Guard 注册（AppModule）
 */

import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from '../../core/guards/auth.guard';
import { RateLimitGuard } from '../../core/guards/rate-limit.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthTokenService } from './auth-token.service';
import { JwtTokenService } from './jwt-token.service';
import { LogtoAuthService } from './logto/logto-auth.service';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtTokenService,
    AuthTokenService,
    LogtoAuthService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
  exports: [AuthService, JwtTokenService, AuthTokenService],
})
export class AuthModule {}
