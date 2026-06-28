/**
 * 认证 HTTP 入口：登录、刷新令牌、当前用户。
 *
 * 边界：
 * - 不负责：JWT 校验逻辑（AuthGuard）
 *
 * 入口：
 * - AuthController
 */

import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { ReqCtx } from '../../core/decorators/request-context.decorator';
import { Public } from '../../core/decorators/public.decorator';
import type { RequestContext } from '@wm/shared-core';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LogtoCallbackDto } from './dto/logto-callback.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { MemberInviteService } from '../organization/member-invite.service';
import {
  buildLogtoAuthorizeUrl,
  isLogtoEnabled,
  readLogtoConfig,
} from './logto/logto.config';

@Controller('api/v1/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly memberInviteService: MemberInviteService,
  ) {}

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

  @Public()
  @Get('logto/config')
  async logtoConfig() {
    const cfg = readLogtoConfig();
    return {
      success: true,
      data: {
        enabled: isLogtoEnabled(),
        endpoint: cfg?.endpoint ?? null,
        appId: cfg?.appId ?? null,
        redirectUri: cfg?.redirectUri ?? null,
        authorizeUrl: buildLogtoAuthorizeUrl(),
      },
      meta: { traceId: `tr_auth_${uuidv4()}` },
    };
  }

  @Public()
  @Post('logto/callback')
  @HttpCode(HttpStatus.OK)
  async logtoCallback(@Body() dto: LogtoCallbackDto) {
    const session = await this.authService.loginWithLogtoCode(
      dto.code,
      dto.redirectUri,
      dto.inviteToken,
    );
    return {
      success: true,
      data: session,
      meta: { traceId: `tr_auth_${uuidv4()}` },
    };
  }

  @Public()
  @Get('invite/validate')
  async validateInvite(@Query('token') token: string) {
    const data = await this.memberInviteService.validateToken(token);
    return { data, meta: { traceId: `tr_auth_${uuidv4()}` } };
  }

  @Public()
  @Get('invite/accept')
  async acceptInvite(@Query('token') token: string) {
    const data = await this.memberInviteService.acceptToken(token);
    return { data, meta: { traceId: `tr_auth_${uuidv4()}` } };
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
