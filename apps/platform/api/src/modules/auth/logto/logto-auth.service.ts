/**
 * Logto OIDC：授权码交换与 ID Token 校验。
 *
 * 边界：
 * - 不负责：平台 JWT 签发（AuthService）
 *
 * 入口：
 * - LogtoAuthService
 */

import { createRemoteJWKSet, jwtVerify } from 'jose';
import { Injectable } from '@nestjs/common';
import { fetch } from 'undici';
import { BusinessException } from '../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../core/exceptions/error-codes';
import { readLogtoConfig, type LogtoConfig } from './logto.config';

export interface LogtoIdentity {
  sub: string;
  email: string;
  name?: string;
}

interface LogtoTokenResponse {
  id_token?: string;
  access_token?: string;
  token_type?: string;
  expires_in?: number;
}

@Injectable()
export class LogtoAuthService {
  private jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

  async exchangeAuthorizationCode(code: string, redirectUri: string): Promise<LogtoIdentity> {
    const cfg = this.requireConfig();
    this.assertRedirectUri(redirectUri, cfg);

    const tokenUrl = `${cfg.endpoint}/oidc/token`;
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: cfg.appId,
      client_secret: cfg.appSecret,
    });

    let response: Response;
    try {
      response = (await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      })) as Response;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Logto 令牌交换失败';
      throw new BusinessException(ErrorCodes.EXTERNAL_API_ERROR, `无法连接 Logto：${message}`);
    }

    const payload = (await response.json().catch(() => ({}))) as LogtoTokenResponse & {
      error?: string;
      error_description?: string;
    };

    if (!response.ok) {
      const detail = payload.error_description ?? payload.error ?? response.statusText;
      throw new BusinessException(ErrorCodes.UNAUTHORIZED, `Logto 登录失败：${detail}`);
    }

    if (!payload.id_token) {
      throw new BusinessException(ErrorCodes.UNAUTHORIZED, 'Logto 未返回 id_token');
    }

    return this.verifyIdToken(payload.id_token, cfg);
  }

  async verifyIdToken(idToken: string, cfg?: LogtoConfig): Promise<LogtoIdentity> {
    const config = cfg ?? this.requireConfig();
    const jwks = this.getJwks(config.endpoint);

    const { payload } = await jwtVerify(idToken, jwks, {
      issuer: `${config.endpoint}/oidc`,
      audience: config.appId,
    });

    const sub = typeof payload.sub === 'string' ? payload.sub : '';
    const email = this.resolveEmail(payload);
    if (!sub || !email) {
      throw new BusinessException(ErrorCodes.UNAUTHORIZED, 'Logto 身份缺少 sub 或 email');
    }

    const name =
      typeof payload.name === 'string'
        ? payload.name
        : typeof payload.username === 'string'
          ? payload.username
          : undefined;

    return { sub, email, name };
  }

  private resolveEmail(payload: Record<string, unknown>): string {
    const direct = payload.email;
    if (typeof direct === 'string' && direct.includes('@')) {
      return direct.trim().toLowerCase();
    }

    const primary = payload.primaryEmail;
    if (typeof primary === 'string' && primary.includes('@')) {
      return primary.trim().toLowerCase();
    }

    return '';
  }

  private getJwks(endpoint: string): ReturnType<typeof createRemoteJWKSet> {
    const cached = this.jwksCache.get(endpoint);
    if (cached) {
      return cached;
    }
    const jwks = createRemoteJWKSet(new URL(`${endpoint}/oidc/jwks`));
    this.jwksCache.set(endpoint, jwks);
    return jwks;
  }

  private requireConfig(): LogtoConfig {
    const cfg = readLogtoConfig();
    if (!cfg) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, 'Logto 未配置，请设置 LOGTO_* 环境变量');
    }
    return cfg;
  }

  private assertRedirectUri(redirectUri: string, cfg: LogtoConfig): void {
    if (redirectUri.trim() !== cfg.redirectUri) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, 'redirectUri 与 Logto 配置不一致');
    }
  }
}
