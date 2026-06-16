/**
 * CMS 发布服务：WordPress REST / Shopify Admin API 推送已完成文章。
 *
 * 边界：
 * - 不负责：HTML 打包存储（ExportService）
 * - 默认发布为草稿，需人工在 CMS 后台确认
 *
 * 入口：
 * - CmsPublishService
 */

import { Injectable } from '@nestjs/common';
import { JobStatus } from '@prisma/client';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { fetchWithRetry } from '../../../../core/http/http-fetch';
import { PrismaService } from '../../../../core/database/prisma.service';
import { LoggerService } from '../../../../core/logger/logger.service';
import { canPublishArticle } from '../content-review/ymyl-detect.util';
import {
  getShopifyApiVersion,
  parseShopifyCmsConfig,
  parseWordPressCmsConfig,
  type ShopifyCmsConfig,
  type WordPressPostStatus,
} from '../site/site-cms.util';
import { markdownToHtml } from '../../providers/semrush/semrush-content';
import type { PublishArticleJobDto } from './dto/publish-article-job.dto';
import type { BatchPublishArticleJobsDto } from '../article-job/dto/batch-article-jobs-actions.dto';
import { StorageService } from '../../../../core/storage/storage.service';
import {
  buildDraftImageStorageKey,
  parseDraftImageApiUrl,
} from '../article-job/draft-image.util';
import { fetchRemoteImage } from './export-package.util';
import { ShopifyFilesService } from './shopify-files.service';
import {
  decodeHtmlAttr,
  extractHtmlImageSrcs,
  shouldRemapImageForShopify,
} from './shopify-files.util';

export interface CmsPublishRecordBase {
  provider: 'wordpress' | 'shopify';
  postId: number | null;
  postUrl: string | null;
  status: string;
  publishedAt: string;
  lastError?: string;
  attemptCount?: number;
}

export interface WordPressCmsPublishRecord extends CmsPublishRecordBase {
  provider: 'wordpress';
  wpStatusRequested: WordPressPostStatus;
}

export interface ShopifyCmsPublishRecord extends CmsPublishRecordBase {
  provider: 'shopify';
  publishTarget: 'blog' | 'product';
  publishedRequested: boolean;
  blogId?: string;
  productId?: string;
}

export type CmsPublishRecord = WordPressCmsPublishRecord | ShopifyCmsPublishRecord;

interface WordPressPostResponse {
  id?: number;
  link?: string;
  status?: string;
}

interface ShopifyArticleResponse {
  article?: {
    id?: number;
    handle?: string;
    published_at?: string | null;
  };
}

interface ShopifyBlogResponse {
  blog?: {
    handle?: string;
  };
}

interface ShopifyProductResponse {
  product?: {
    id?: number;
    handle?: string;
    status?: string;
  };
}

interface PublishJobContext {
  jobId: string;
  traceId: string;
  organizationId: string;
  projectId: string;
  title: string;
  contentHtml: string;
  metaDescription?: string;
  seoCheckData: unknown;
  previous?: CmsPublishRecord;
}

@Injectable()
export class CmsPublishService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly storage: StorageService,
    private readonly shopifyFiles: ShopifyFilesService,
  ) {}

  async publishJob(
    organizationId: string,
    projectId: string,
    jobId: string,
    traceId: string,
    dto: PublishArticleJobDto = {},
  ): Promise<CmsPublishRecord> {
    const job = await this.loadPublishableJob(organizationId, projectId, jobId);
    const ctx = this.buildPublishContext(job, traceId, organizationId, projectId);

    if (job.site.cmsType === 'shopify') {
      const config = parseShopifyCmsConfig(job.site.cmsType, job.site.cmsConfig);
      if (!config) {
        throw new BusinessException(
          ErrorCodes.CMS_NOT_CONFIGURED,
          '请先在站点设置中配置 Shopify Admin API',
        );
      }
      return this.publishToShopify(ctx, config, dto);
    }

    const wpConfig = parseWordPressCmsConfig(job.site.cmsType, job.site.cmsConfig);
    if (!wpConfig) {
      throw new BusinessException(
        ErrorCodes.CMS_NOT_CONFIGURED,
        '请先在站点设置中配置 WordPress REST API',
      );
    }
    return this.publishToWordPress(ctx, wpConfig, dto);
  }

  async batchPublish(
    organizationId: string,
    projectId: string,
    traceId: string,
    dto: BatchPublishArticleJobsDto,
  ) {
    const results: Array<{ jobId: string; ok: boolean; data?: CmsPublishRecord; error?: string }> =
      [];

    for (const jobId of dto.jobIds) {
      try {
        const data = await this.publishJob(organizationId, projectId, jobId, traceId, {
          status: dto.status,
        });
        results.push({ jobId, ok: true, data });
      } catch (error) {
        const message =
          error instanceof BusinessException
            ? error.message
            : error instanceof Error
              ? error.message
              : 'CMS 发布失败';
        await this.recordPublishFailure(jobId, message);
        results.push({ jobId, ok: false, error: message });
      }
    }

    return {
      published: results.filter((item) => item.ok).length,
      failed: results.filter((item) => !item.ok).length,
      results,
    };
  }

  private async loadPublishableJob(organizationId: string, projectId: string, jobId: string) {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: jobId, organizationId, projectId },
      include: {
        site: {
          select: {
            id: true,
            domain: true,
            cmsType: true,
            cmsConfig: true,
          },
        },
      },
    });

    if (!job) {
      throw new BusinessException(ErrorCodes.JOB_NOT_FOUND, '任务不存在');
    }

    if (job.status !== JobStatus.COMPLETED) {
      throw new BusinessException(ErrorCodes.JOB_NOT_PUBLISHABLE, '仅已完成任务可发布到 CMS');
    }

    if (!canPublishArticle(job.seoCheckData)) {
      throw new BusinessException(
        ErrorCodes.JOB_NOT_PUBLISHABLE,
        '文章未通过 YMYL 审核，暂不可发布',
      );
    }

    if (job.site.cmsType !== 'wordpress' && job.site.cmsType !== 'shopify') {
      throw new BusinessException(ErrorCodes.CMS_NOT_CONFIGURED, '请先在站点设置中配置 CMS');
    }

    const draftData = job.draftData as { content?: string } | null;
    if (!draftData?.content?.trim()) {
      throw new BusinessException(ErrorCodes.JOB_NOT_PUBLISHABLE, '正文为空，无法发布');
    }

    return job;
  }

  private buildPublishContext(
    job: {
      id: string;
      targetKeyword: string;
      briefData: unknown;
      draftData: unknown;
      seoCheckData: unknown;
    },
    traceId: string,
    organizationId: string,
    projectId: string,
  ): PublishJobContext {
    const draftData = job.draftData as {
      title?: string;
      metaDescription?: string;
      content?: string;
    } | null;
    const briefData = job.briefData as { outline?: { title?: string } } | null;
    const previous = ((job.seoCheckData ?? {}) as { cmsPublish?: CmsPublishRecord }).cmsPublish;

    return {
      jobId: job.id,
      traceId,
      organizationId,
      projectId,
      title: draftData?.title ?? briefData?.outline?.title ?? job.targetKeyword,
      contentHtml: markdownToHtml(draftData?.content?.trim() ?? ''),
      metaDescription: draftData?.metaDescription?.trim() || undefined,
      seoCheckData: job.seoCheckData,
      previous,
    };
  }

  private async publishToWordPress(
    ctx: PublishJobContext,
    config: NonNullable<ReturnType<typeof parseWordPressCmsConfig>>,
    dto: PublishArticleJobDto,
  ): Promise<WordPressCmsPublishRecord> {
    const status: WordPressPostStatus = dto.status ?? config.defaultStatus ?? 'draft';
    const postId =
      ctx.previous?.provider === 'wordpress' ? ctx.previous.postId : null;
    const endpoint = postId
      ? `${config.baseUrl}/wp-json/wp/v2/posts/${postId}`
      : `${config.baseUrl}/wp-json/wp/v2/posts`;
    const auth = Buffer.from(`${config.username}:${config.applicationPassword}`).toString('base64');

    let response: Response;
    try {
      response = await fetchWithRetry(
        endpoint,
        {
          method: postId ? 'PUT' : 'POST',
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: ctx.title,
            content: ctx.contentHtml,
            status,
            excerpt: ctx.metaDescription,
          }),
        },
        { label: 'WordPress REST API' },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'WordPress 请求失败';
      throw new BusinessException(ErrorCodes.CMS_PUBLISH_FAILED, message);
    }

    const bodyText = await response.text();
    let payload: WordPressPostResponse = {};
    try {
      payload = bodyText ? (JSON.parse(bodyText) as WordPressPostResponse) : {};
    } catch {
      payload = {};
    }

    if (!response.ok) {
      throw new BusinessException(
        ErrorCodes.CMS_PUBLISH_FAILED,
        `WordPress 发布失败：HTTP ${response.status}${bodyText ? ` — ${bodyText.slice(0, 200)}` : ''}`,
      );
    }

    const cmsPublish: WordPressCmsPublishRecord = {
      provider: 'wordpress',
      postId: payload.id ?? postId ?? null,
      postUrl: payload.link ?? null,
      status: payload.status ?? status,
      publishedAt: new Date().toISOString(),
      wpStatusRequested: status,
      attemptCount: (ctx.previous?.attemptCount ?? 0) + 1,
    };

    await this.persistCmsPublish(ctx.jobId, ctx.seoCheckData, cmsPublish);
    this.logger.info('Article published to WordPress', {
      traceId: ctx.traceId,
      jobId: ctx.jobId,
      postId: cmsPublish.postId,
      postUrl: cmsPublish.postUrl,
      status: cmsPublish.status,
    });

    return cmsPublish;
  }

  private async publishToShopify(
    ctx: PublishJobContext,
    config: ShopifyCmsConfig,
    dto: PublishArticleJobDto,
  ): Promise<ShopifyCmsPublishRecord> {
    const publishTarget = this.resolveShopifyPublishTarget(config, dto, ctx.previous);
    if (publishTarget === 'product') {
      return this.publishToShopifyProduct(ctx, config, dto);
    }
    return this.publishToShopifyBlog(ctx, config, dto);
  }

  private resolveShopifyPublishTarget(
    config: ShopifyCmsConfig,
    dto: PublishArticleJobDto,
    previous?: CmsPublishRecord,
  ): 'blog' | 'product' {
    if (dto.target === 'product' || dto.target === 'blog') {
      return dto.target;
    }
    if (previous?.provider === 'shopify' && previous.publishTarget) {
      return previous.publishTarget;
    }
    return config.publishTarget ?? 'blog';
  }

  private resolveShopifyProductId(
    config: ShopifyCmsConfig,
    dto: PublishArticleJobDto,
    previous?: CmsPublishRecord,
  ): string {
    const productId =
      dto.productId?.trim() ||
      (previous?.provider === 'shopify' ? previous.productId : undefined) ||
      config.productId?.trim();

    if (!productId) {
      throw new BusinessException(
        ErrorCodes.VALIDATION_ERROR,
        '请先在站点设置中选择 Shopify Product，或在推送时指定 productId',
      );
    }

    return productId;
  }

  private async publishToShopifyBlog(
    ctx: PublishJobContext,
    config: ShopifyCmsConfig,
    dto: PublishArticleJobDto,
  ): Promise<ShopifyCmsPublishRecord> {
    const publishedRequested =
      dto.status != null ? dto.status === 'publish' : config.defaultPublished === true;
    const apiVersion = getShopifyApiVersion();
    const postId =
      ctx.previous?.provider === 'shopify' ? ctx.previous.postId : null;
    const contentHtml = await this.remapImagesForShopify(ctx.contentHtml, config, ctx);
    const endpoint = postId
      ? `https://${config.shopDomain}/admin/api/${apiVersion}/blogs/${config.blogId}/articles/${postId}.json`
      : `https://${config.shopDomain}/admin/api/${apiVersion}/blogs/${config.blogId}/articles.json`;

    let response: Response;
    try {
      response = await fetchWithRetry(
        endpoint,
        {
          method: postId ? 'PUT' : 'POST',
          headers: {
            'X-Shopify-Access-Token': config.accessToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            article: {
              title: ctx.title,
              body_html: contentHtml,
              summary_html: ctx.metaDescription,
              published: publishedRequested,
            },
          }),
        },
        { label: 'Shopify Admin API' },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Shopify 请求失败';
      throw new BusinessException(ErrorCodes.CMS_PUBLISH_FAILED, message);
    }

    const bodyText = await response.text();
    let payload: ShopifyArticleResponse = {};
    try {
      payload = bodyText ? (JSON.parse(bodyText) as ShopifyArticleResponse) : {};
    } catch {
      payload = {};
    }

    if (!response.ok) {
      throw new BusinessException(
        ErrorCodes.CMS_PUBLISH_FAILED,
        `Shopify 发布失败：HTTP ${response.status}${bodyText ? ` — ${bodyText.slice(0, 200)}` : ''}`,
      );
    }

    const article = payload.article;
    const blogHandle = await this.fetchShopifyBlogHandle(config, apiVersion);
    const postUrl =
      article?.handle && blogHandle
        ? `https://${config.shopDomain}/blogs/${blogHandle}/${article.handle}`
        : null;

    const cmsPublish: ShopifyCmsPublishRecord = {
      provider: 'shopify',
      publishTarget: 'blog',
      postId: article?.id ?? postId ?? null,
      postUrl,
      status: article?.published_at ? 'published' : 'draft',
      publishedAt: new Date().toISOString(),
      publishedRequested,
      blogId: config.blogId,
      attemptCount: (ctx.previous?.attemptCount ?? 0) + 1,
    };

    await this.persistCmsPublish(ctx.jobId, ctx.seoCheckData, cmsPublish);
    this.logger.info('Article published to Shopify blog', {
      traceId: ctx.traceId,
      jobId: ctx.jobId,
      postId: cmsPublish.postId,
      postUrl: cmsPublish.postUrl,
      status: cmsPublish.status,
    });

    return cmsPublish;
  }

  private async publishToShopifyProduct(
    ctx: PublishJobContext,
    config: ShopifyCmsConfig,
    dto: PublishArticleJobDto,
  ): Promise<ShopifyCmsPublishRecord> {
    const publishedRequested =
      dto.status != null ? dto.status === 'publish' : config.defaultPublished === true;
    const apiVersion = getShopifyApiVersion();
    const productId = this.resolveShopifyProductId(config, dto, ctx.previous);
    const previousProductId =
      ctx.previous?.provider === 'shopify' && ctx.previous.publishTarget === 'product'
        ? ctx.previous.postId
        : null;
    const contentHtml = await this.remapImagesForShopify(ctx.contentHtml, config, ctx);
    const endpoint = `https://${config.shopDomain}/admin/api/${apiVersion}/products/${productId}.json`;

    let response: Response;
    try {
      response = await fetchWithRetry(
        endpoint,
        {
          method: 'PUT',
          headers: {
            'X-Shopify-Access-Token': config.accessToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            product: {
              id: Number(productId),
              body_html: contentHtml,
              status: publishedRequested ? 'active' : 'draft',
            },
          }),
        },
        { label: 'Shopify Admin API' },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Shopify 请求失败';
      throw new BusinessException(ErrorCodes.CMS_PUBLISH_FAILED, message);
    }

    const bodyText = await response.text();
    let payload: ShopifyProductResponse = {};
    try {
      payload = bodyText ? (JSON.parse(bodyText) as ShopifyProductResponse) : {};
    } catch {
      payload = {};
    }

    if (!response.ok) {
      throw new BusinessException(
        ErrorCodes.CMS_PUBLISH_FAILED,
        `Shopify 产品页更新失败：HTTP ${response.status}${bodyText ? ` — ${bodyText.slice(0, 200)}` : ''}`,
      );
    }

    const product = payload.product;
    const postUrl = product?.handle
      ? `https://${config.shopDomain}/products/${product.handle}`
      : null;

    const cmsPublish: ShopifyCmsPublishRecord = {
      provider: 'shopify',
      publishTarget: 'product',
      postId: product?.id ?? previousProductId ?? Number(productId),
      postUrl,
      status: product?.status === 'active' ? 'published' : 'draft',
      publishedAt: new Date().toISOString(),
      publishedRequested,
      productId,
      attemptCount: (ctx.previous?.attemptCount ?? 0) + 1,
    };

    await this.persistCmsPublish(ctx.jobId, ctx.seoCheckData, cmsPublish);
    this.logger.info('Article published to Shopify product', {
      traceId: ctx.traceId,
      jobId: ctx.jobId,
      productId: cmsPublish.productId,
      postUrl: cmsPublish.postUrl,
      status: cmsPublish.status,
    });

    return cmsPublish;
  }

  private async fetchShopifyBlogHandle(
    config: ShopifyCmsConfig,
    apiVersion: string,
  ): Promise<string | null> {
    try {
      const response = await fetchWithRetry(
        `https://${config.shopDomain}/admin/api/${apiVersion}/blogs/${config.blogId}.json`,
        {
          method: 'GET',
          headers: {
            'X-Shopify-Access-Token': config.accessToken,
            'Content-Type': 'application/json',
          },
        },
        { label: 'Shopify Admin API' },
      );
      const bodyText = await response.text();
      if (!response.ok) return null;
      const payload = bodyText ? (JSON.parse(bodyText) as ShopifyBlogResponse) : {};
      return payload.blog?.handle?.trim() || null;
    } catch {
      return null;
    }
  }

  private async persistCmsPublish(
    jobId: string,
    seoCheckData: unknown,
    cmsPublish: CmsPublishRecord,
  ) {
    const seoCheckDataNext = {
      ...((seoCheckData ?? {}) as Record<string, unknown>),
      cmsPublish,
    };

    await this.prisma.articleJob.update({
      where: { id: jobId },
      data: { seoCheckData: seoCheckDataNext as object },
    });
  }

  private async recordPublishFailure(jobId: string, message: string) {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: jobId },
      select: { seoCheckData: true, site: { select: { cmsType: true, cmsConfig: true } } },
    });
    if (!job) return;

    const previous = ((job.seoCheckData ?? {}) as { cmsPublish?: CmsPublishRecord }).cmsPublish;
    const provider =
      previous?.provider ??
      (job.site.cmsType === 'shopify'
        ? 'shopify'
        : job.site.cmsType === 'wordpress'
          ? 'wordpress'
          : 'wordpress');

    let cmsPublish: CmsPublishRecord;
    if (provider === 'shopify') {
      const config = parseShopifyCmsConfig('shopify', job.site.cmsConfig);
      const previousShopify = previous?.provider === 'shopify' ? previous : undefined;
      cmsPublish = {
        provider: 'shopify',
        publishTarget: previousShopify?.publishTarget ?? config?.publishTarget ?? 'blog',
        postId: previous?.postId ?? null,
        postUrl: previous?.postUrl ?? null,
        status: previous?.status ?? 'failed',
        publishedAt: previous?.publishedAt ?? new Date().toISOString(),
        publishedRequested: previousShopify?.publishedRequested ?? false,
        blogId: previousShopify?.blogId ?? config?.blogId,
        productId: previousShopify?.productId ?? config?.productId,
        lastError: message,
        attemptCount: (previous?.attemptCount ?? 0) + 1,
      };
    } else {
      cmsPublish = {
        provider: 'wordpress',
        postId: previous?.postId ?? null,
        postUrl: previous?.postUrl ?? null,
        status: previous?.status ?? 'failed',
        publishedAt: previous?.publishedAt ?? new Date().toISOString(),
        wpStatusRequested:
          previous?.provider === 'wordpress' ? previous.wpStatusRequested : 'draft',
        lastError: message,
        attemptCount: (previous?.attemptCount ?? 0) + 1,
      };
    }

    await this.persistCmsPublish(jobId, job.seoCheckData, cmsPublish);
  }

  private async remapImagesForShopify(
    html: string,
    config: ShopifyCmsConfig,
    ctx: PublishJobContext,
  ): Promise<string> {
    let next = html;
    let uploadIndex = 0;

    for (const src of extractHtmlImageSrcs(html)) {
      if (!shouldRemapImageForShopify(src, config.shopDomain)) continue;

      const fetched = await this.fetchImageForCms(src, ctx);
      if (!fetched) {
        this.logger.warn('Shopify CMS skip image: source unavailable', {
          traceId: ctx.traceId,
          jobId: ctx.jobId,
          src,
          action: 'cms.shopify_image_skip',
        });
        continue;
      }

      const shopifyUrl = await this.shopifyFiles.uploadImageFromSource(
        config,
        decodeHtmlAttr(src),
        fetched.body,
        fetched.contentType,
        uploadIndex,
        ctx.traceId,
      );
      uploadIndex += 1;
      next = next.split(src).join(shopifyUrl);
    }

    return next;
  }

  private async fetchImageForCms(
    src: string,
    ctx: Pick<PublishJobContext, 'organizationId' | 'projectId' | 'jobId'>,
  ): Promise<{ body: Buffer; contentType?: string } | null> {
    const decoded = decodeHtmlAttr(src);
    const parsed = parseDraftImageApiUrl(decoded);
    if (parsed && parsed.projectId === ctx.projectId && parsed.jobId === ctx.jobId) {
      const key = buildDraftImageStorageKey(
        ctx.organizationId,
        ctx.projectId,
        ctx.jobId,
        parsed.filename,
      );
      const stored = await this.storage.getObject(key);
      if (!stored) return null;
      return { body: stored.body, contentType: stored.contentType };
    }

    if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
      return fetchRemoteImage(decoded);
    }

    return null;
  }
}
