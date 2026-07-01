/**
 * GSC OAuth 与平台凭据读写。
 */

import { Injectable } from '@nestjs/common';
import { google } from 'googleapis';
import { PrismaService } from '../../../../core/database/prisma.service';
import { decryptSecret, encryptSecret, isEncryptedSecret } from '../../../../core/crypto/secret-cipher.util';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { LoggerService } from '../../../../core/logger/logger.service';
import { GSC_OAUTH_SCOPES } from './gsc.constants';
import {
  filterUsableGscPropertyEntries,
  signGscOAuthState,
  verifyGscOAuthState,
} from './gsc-oauth.util';
import {
  GSC_PROPERTY_COUNT_CACHE_MS,
  PLATFORM_GSC_CREDENTIAL_ID,
  type GscOAuthConfig,
  type PlatformGscStatus,
} from './gsc.types';

@Injectable()
export class GscOAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  isConfigured(): boolean {
    return this.readOAuthConfig() !== null;
  }

  async getPlatformStatus(): Promise<PlatformGscStatus> {
    const oauthConfigured = this.isConfigured();
    const credential = await this.prisma.platformGscCredential.findUnique({
      where: { id: PLATFORM_GSC_CREDENTIAL_ID },
    });

    if (!credential) {
      return {
        oauthConfigured,
        platformConnected: false,
        googleEmail: null,
        connectedAt: null,
        propertyCount: null,
      };
    }

    let propertyCount: number | null = credential.cachedPropertyCount ?? null;
    if (oauthConfigured) {
      const cacheValid =
        credential.propertyCountCachedAt &&
        Date.now() - credential.propertyCountCachedAt.getTime() < GSC_PROPERTY_COUNT_CACHE_MS;
      if (!cacheValid || propertyCount === null) {
        try {
          const token = await this.getPlatformRefreshToken();
          if (token) {
            const entries = await this.listGscPropertyEntries(token);
            propertyCount = entries.length;
            await this.prisma.platformGscCredential.update({
              where: { id: PLATFORM_GSC_CREDENTIAL_ID },
              data: {
                cachedPropertyCount: propertyCount,
                propertyCountCachedAt: new Date(),
              },
            });
          }
        } catch {
          propertyCount = credential.cachedPropertyCount ?? null;
        }
      }
    }

    return {
      oauthConfigured,
      platformConnected: true,
      googleEmail: credential.googleEmail ?? null,
      connectedAt: credential.createdAt.toISOString(),
      propertyCount,
    };
  }

  async createPlatformConnectUrl(connectedByUserId?: string) {
    const cfg = this.requireOAuthConfig();
    const state = signGscOAuthState({
      mode: 'platform',
      exp: Date.now() + 10 * 60 * 1000,
      connectedByUserId,
    });

    const client = this.createOAuthClient(cfg);
    const authUrl = client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: GSC_OAUTH_SCOPES,
      state,
    });

    return { authUrl };
  }

  async disconnectPlatform() {
    await this.prisma.$transaction([
      this.prisma.siteGscConnection.deleteMany({
        where: { managedByPlatform: true },
      }),
      this.prisma.platformGscCredential.deleteMany({
        where: { id: PLATFORM_GSC_CREDENTIAL_ID },
      }),
    ]);
    return { disconnected: true };
  }

  async handleOAuthCallback(code: string, state: string): Promise<string> {
    const cfg = this.requireOAuthConfig();
    const payload = verifyGscOAuthState(state);

    if (!payload) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, 'GSC 授权状态无效或已过期');
    }

    if (payload.mode !== 'platform') {
      throw new BusinessException(
        ErrorCodes.FORBIDDEN,
        '站点级 OAuth 已停用，请由平台管理员在 Console 统一授权',
      );
    }

    return this.handlePlatformOAuthCallback(code, cfg, payload);
  }

  async getPlatformRefreshToken(): Promise<string | null> {
    const credential = await this.prisma.platformGscCredential.findUnique({
      where: { id: PLATFORM_GSC_CREDENTIAL_ID },
      select: { refreshTokenEnc: true },
    });
    if (!credential?.refreshTokenEnc) {
      return null;
    }

    const plain = decryptSecret(credential.refreshTokenEnc);
    if (!isEncryptedSecret(credential.refreshTokenEnc)) {
      void this.prisma.platformGscCredential
        .update({
          where: { id: PLATFORM_GSC_CREDENTIAL_ID },
          data: { refreshTokenEnc: encryptSecret(plain) },
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : 'GSC token 加密迁移失败';
          this.logger.warn('GSC refresh token lazy encrypt failed', {
            action: 'gsc.token.encrypt',
            message,
          });
        });
    }

    return plain;
  }

  async listGscPropertyEntries(refreshToken: string): Promise<string[]> {
    const cfg = this.requireOAuthConfig();
    const client = this.createOAuthClient(cfg);
    client.setCredentials({ refresh_token: refreshToken });
    const searchconsole = google.searchconsole({ version: 'v1', auth: client });
    const sitesRes = await searchconsole.sites.list();
    return filterUsableGscPropertyEntries(sitesRes.data.siteEntry ?? []);
  }

  requireOAuthConfig(): GscOAuthConfig {
    const cfg = this.readOAuthConfig();
    if (!cfg) {
      throw new BusinessException(
        ErrorCodes.GSC_NOT_CONFIGURED,
        '未配置 Google Search Console OAuth（GOOGLE_GSC_CLIENT_ID / SECRET / REDIRECT_URI）',
      );
    }
    return cfg;
  }

  createOAuthClient(cfg: GscOAuthConfig) {
    return new google.auth.OAuth2(cfg.clientId, cfg.clientSecret, cfg.redirectUri);
  }

  private async handlePlatformOAuthCallback(
    code: string,
    cfg: GscOAuthConfig,
    payload: NonNullable<ReturnType<typeof verifyGscOAuthState>>,
  ): Promise<string> {
    const client = this.createOAuthClient(cfg);
    const { tokens } = await client.getToken(code);

    if (!tokens.refresh_token) {
      throw new BusinessException(
        ErrorCodes.VALIDATION_ERROR,
        'Google 未返回 refresh_token，请撤销授权后重试',
      );
    }

    client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    let googleEmail: string | null = null;
    try {
      const profile = await oauth2.userinfo.get();
      googleEmail = profile.data.email ?? null;
    } catch {
      googleEmail = null;
    }

    const encryptedToken = encryptSecret(tokens.refresh_token);

    await this.prisma.platformGscCredential.upsert({
      where: { id: PLATFORM_GSC_CREDENTIAL_ID },
      create: {
        id: PLATFORM_GSC_CREDENTIAL_ID,
        refreshTokenEnc: encryptedToken,
        googleEmail,
        connectedByUserId: payload.connectedByUserId ?? null,
        cachedPropertyCount: null,
        propertyCountCachedAt: null,
      },
      update: {
        refreshTokenEnc: encryptedToken,
        googleEmail,
        connectedByUserId: payload.connectedByUserId ?? null,
        cachedPropertyCount: null,
        propertyCountCachedAt: null,
      },
    });

    this.logger.info('GSC platform connected', {
      googleEmail,
      action: 'gsc.platform.connect',
    });

    return `${cfg.webAppOrigin}/console/sites?gsc=connected`;
  }

  private readOAuthConfig(): GscOAuthConfig | null {
    const clientId = process.env.GOOGLE_GSC_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_GSC_CLIENT_SECRET?.trim();
    const redirectUri = process.env.GOOGLE_GSC_REDIRECT_URI?.trim();
    const webAppOrigin = process.env.WEB_APP_ORIGIN?.trim() || 'http://localhost:5173';

    if (!clientId || !clientSecret || !redirectUri) {
      return null;
    }

    return { clientId, clientSecret, redirectUri, webAppOrigin };
  }
}
