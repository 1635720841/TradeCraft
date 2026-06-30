/**
 * 站点 CMS 集成：Shopify Admin API 列表查询等。
 *
 * 边界：
 * - 不负责：站点 CRUD（SiteService）
 *
 * 入口：
 * - SiteCmsService
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../core/database/prisma.service';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { fetchWithRetry } from '../../../../core/http/http-fetch';
import {
  getShopifyApiVersion,
  normalizeShopifyDomain,
  parseShopifyCmsConfig,
} from './site-cms.util';
import type { ListShopifyBlogsDto } from './dto/list-shopify-blogs.dto';

@Injectable()
export class SiteCmsService {
  constructor(private readonly prisma: PrismaService) {}

  async listShopifyBlogs(
    organizationId: string,
    projectId: string,
    dto: ListShopifyBlogsDto,
  ): Promise<Array<{ id: string; title: string; handle: string }>> {
    const { shopDomain, accessToken } = await this.resolveShopifyCredentials(
      organizationId,
      projectId,
      dto,
    );

    const payload = await this.fetchShopifyJson<{
      blogs?: Array<{ id: number; title: string; handle: string }>;
    }>(shopDomain, accessToken, 'blogs.json', 'Shopify 读取 Blog 列表失败');

    return (payload.blogs ?? []).map((blog) => ({
      id: String(blog.id),
      title: blog.title,
      handle: blog.handle,
    }));
  }

  async listShopifyProducts(
    organizationId: string,
    projectId: string,
    dto: ListShopifyBlogsDto,
  ): Promise<Array<{ id: string; title: string; handle: string; status: string }>> {
    const { shopDomain, accessToken } = await this.resolveShopifyCredentials(
      organizationId,
      projectId,
      dto,
    );

    const payload = await this.fetchShopifyJson<{
      products?: Array<{ id: number; title: string; handle: string; status: string }>;
    }>(
      shopDomain,
      accessToken,
      'products.json?limit=50&fields=id,title,handle,status',
      'Shopify 读取 Product 列表失败',
    );

    return (payload.products ?? []).map((product) => ({
      id: String(product.id),
      title: product.title,
      handle: product.handle,
      status: product.status,
    }));
  }

  private async resolveShopifyCredentials(
    organizationId: string,
    projectId: string,
    dto: ListShopifyBlogsDto,
  ): Promise<{ shopDomain: string; accessToken: string }> {
    let shopDomain = dto.shopDomain?.trim();
    let accessToken = dto.accessToken?.trim();

    if (dto.siteId) {
      const site = await this.prisma.site.findFirst({
        where: { id: dto.siteId, organizationId, projectId },
        select: { cmsType: true, cmsConfig: true },
      });

      if (!site) {
        throw new BusinessException(ErrorCodes.SITE_NOT_FOUND, '站点不存在');
      }
      if (site.cmsType !== 'shopify') {
        throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '该站点未配置 Shopify');
      }

      const parsed = parseShopifyCmsConfig('shopify', site.cmsConfig);
      if (!parsed) {
        throw new BusinessException(ErrorCodes.VALIDATION_ERROR, 'Shopify 配置不完整');
      }

      shopDomain = shopDomain || parsed.shopDomain;
      accessToken = accessToken || parsed.accessToken;
    }

    if (!shopDomain || !accessToken) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '请填写店铺域名与 Admin API Token');
    }

    return { shopDomain, accessToken };
  }

  private async fetchShopifyJson<T>(
    shopDomain: string,
    accessToken: string,
    path: string,
    errorLabel: string,
  ): Promise<T> {
    const normalizedDomain = normalizeShopifyDomain(shopDomain);
    const apiVersion = getShopifyApiVersion();
    const response = await fetchWithRetry(
      `https://${normalizedDomain}/admin/api/${apiVersion}/${path}`,
      {
        method: 'GET',
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      },
      { label: 'Shopify Admin API' },
    );

    const bodyText = await response.text();
    if (!response.ok) {
      throw new BusinessException(
        ErrorCodes.CMS_PUBLISH_FAILED,
        `${errorLabel}（${response.status}）`,
      );
    }

    return bodyText ? (JSON.parse(bodyText) as T) : ({} as T);
  }
}
