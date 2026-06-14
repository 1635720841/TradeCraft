/**
 * 认证模块：登录、JWT 签发与用户查询。
 *
 * 边界：
 * - 不负责：全局 Guard 注册（AppModule）
 */

import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from '../../core/guards/auth.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtTokenService } from './jwt-token.service';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtTokenService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AuthService, JwtTokenService],
})
export class AuthModule {}
