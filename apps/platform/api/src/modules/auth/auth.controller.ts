/**
 * 认证 HTTP 入口：登录、刷新令牌、当前用户。
 *
 * 边界：
 * - 不负责：JWT 校验逻辑（AuthGuard）
 *
 * 入口：
 * - AuthController
 */

import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { ReqCtx } from '../../core/decorators/request-context.decorator';
import { Public } from '../../core/decorators/public.decorator';
import type { RequestContext } from '@wm/shared-core';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    const session = await this.authService.login(dto);
    return {
      success: true,
      data: session,
      meta: { traceId: `tr_auth_${uuidv4()}` },
    };
  }

  @Public()
  @Post('refresh-token')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto) {
    const session = await this.authService.refresh(dto.refreshToken);
    return {
      success: true,
      data: session,
      meta: { traceId: `tr_auth_${uuidv4()}` },
    };
  }

  @Get('me')
  async me(@ReqCtx() ctx: RequestContext) {
    const profile = await this.authService.getProfile(ctx.userId, ctx.organizationId);
    return {
      data: profile,
      meta: { traceId: ctx.traceId },
    };
  }
}
