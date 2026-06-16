/**
 * Shopify Files 上传：stagedUploadsCreate → PUT → fileCreate。
 *
 * 边界：
 * - 不负责：HTML 正文拼装（CmsPublishService）
 */

import { Injectable } from '@nestjs/common';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { fetchWithRetry } from '../../../../core/http/http-fetch';
import { LoggerService } from '../../../../core/logger/logger.service';
import { getShopifyApiVersion, type ShopifyCmsConfig } from '../site/site-cms.util';
import { buildShopifyUploadFilename, mimeTypeFromExtension } from './shopify-files.util';
import { resolveImageExtension } from './export-package.util';

interface ShopifyGraphqlError {
  message: string;
}

interface StagedUploadTarget {
  url: string;
  resourceUrl: string;
  parameters: Array<{ name: string; value: string }>;
}

const STAGED_UPLOADS_CREATE = `
mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
  stagedUploadsCreate(input: $input) {
    stagedTargets {
      url
      resourceUrl
      parameters { name value }
    }
    userErrors { field message }
  }
}`;

const FILE_CREATE = `
mutation fileCreate($files: [FileCreateInput!]!) {
  fileCreate(files: $files) {
    files {
      ... on MediaImage {
        image { url }
      }
      ... on GenericFile {
        url
      }
    }
    userErrors { field message }
  }
}`;

@Injectable()
export class ShopifyFilesService {
  constructor(private readonly logger: LoggerService) {}

  async uploadImageBuffer(
    config: ShopifyCmsConfig,
    buffer: Buffer,
    filename: string,
    mimeType: string,
    traceId?: string,
  ): Promise<string> {
    const staged = await this.createStagedUpload(config, filename, mimeType, buffer.length);
    await this.putStagedFile(staged, buffer, filename, mimeType);
    const url = await this.createFileFromStaged(config, staged.resourceUrl, mimeType);

    this.logger.info('Shopify image uploaded', {
      traceId,
      shopDomain: config.shopDomain,
      filename,
      action: 'cms.shopify_file_uploaded',
    });

    return url;
  }

  async uploadImageFromSource(
    config: ShopifyCmsConfig,
    sourceUrl: string,
    buffer: Buffer,
    contentType: string | undefined,
    index: number,
    traceId?: string,
  ): Promise<string> {
    const ext = resolveImageExtension(sourceUrl, contentType);
    const filename = buildShopifyUploadFilename(index, sourceUrl, ext);
    const mimeType = contentType?.split(';')[0]?.trim() || mimeTypeFromExtension(ext);
    return this.uploadImageBuffer(config, buffer, filename, mimeType, traceId);
  }

  private async createStagedUpload(
    config: ShopifyCmsConfig,
    filename: string,
    mimeType: string,
    fileSize: number,
  ): Promise<StagedUploadTarget> {
    const payload = await this.graphql<{
      stagedUploadsCreate?: {
        stagedTargets?: StagedUploadTarget[];
        userErrors?: ShopifyGraphqlError[];
      };
    }>(config, STAGED_UPLOADS_CREATE, {
      input: [
        {
          resource: 'FILE',
          filename,
          mimeType,
          fileSize: String(fileSize),
          httpMethod: 'POST',
        },
      ],
    });

    const result = payload.stagedUploadsCreate;
    const userError = result?.userErrors?.[0]?.message;
    if (userError) {
      throw new BusinessException(ErrorCodes.CMS_PUBLISH_FAILED, `Shopify 暂存上传失败：${userError}`);
    }

    const target = result?.stagedTargets?.[0];
    if (!target?.url || !target.resourceUrl) {
      throw new BusinessException(ErrorCodes.CMS_PUBLISH_FAILED, 'Shopify 暂存上传未返回目标地址');
    }

    return target;
  }

  private async putStagedFile(
    target: StagedUploadTarget,
    buffer: Buffer,
    filename: string,
    mimeType: string,
  ): Promise<void> {
    const form = new FormData();
    for (const param of target.parameters) {
      form.append(param.name, param.value);
    }
    form.append('file', new Blob([buffer], { type: mimeType }), filename);

    let response: Response;
    try {
      response = await fetchWithRetry(
        target.url,
        { method: 'POST', body: form },
        { label: 'Shopify staged upload' },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Shopify 图片上传失败';
      throw new BusinessException(ErrorCodes.CMS_PUBLISH_FAILED, message);
    }

    if (!response.ok) {
      const bodyText = await response.text();
      throw new BusinessException(
        ErrorCodes.CMS_PUBLISH_FAILED,
        `Shopify 图片上传失败：HTTP ${response.status}${bodyText ? ` — ${bodyText.slice(0, 200)}` : ''}`,
      );
    }
  }

  private async createFileFromStaged(
    config: ShopifyCmsConfig,
    resourceUrl: string,
    mimeType: string,
  ): Promise<string> {
    const payload = await this.graphql<{
      fileCreate?: {
        files?: Array<{ image?: { url?: string }; url?: string }>;
        userErrors?: ShopifyGraphqlError[];
      };
    }>(config, FILE_CREATE, {
      files: [{ originalSource: resourceUrl, contentType: mimeType }],
    });

    const result = payload.fileCreate;
    const userError = result?.userErrors?.[0]?.message;
    if (userError) {
      throw new BusinessException(ErrorCodes.CMS_PUBLISH_FAILED, `Shopify 文件创建失败：${userError}`);
    }

    const file = result?.files?.[0];
    const url = file?.image?.url?.trim() || file?.url?.trim();
    if (!url) {
      throw new BusinessException(ErrorCodes.CMS_PUBLISH_FAILED, 'Shopify 文件创建未返回 CDN URL');
    }

    return url;
  }

  private async graphql<T>(
    config: ShopifyCmsConfig,
    query: string,
    variables: Record<string, unknown>,
  ): Promise<T> {
    const apiVersion = getShopifyApiVersion();
    const endpoint = `https://${config.shopDomain}/admin/api/${apiVersion}/graphql.json`;

    let response: Response;
    try {
      response = await fetchWithRetry(
        endpoint,
        {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': config.accessToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query, variables }),
        },
        { label: 'Shopify GraphQL' },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Shopify GraphQL 请求失败';
      throw new BusinessException(ErrorCodes.CMS_PUBLISH_FAILED, message);
    }

    const bodyText = await response.text();
    let payload: { data?: T; errors?: ShopifyGraphqlError[] } = {};
    try {
      payload = bodyText ? (JSON.parse(bodyText) as typeof payload) : {};
    } catch {
      payload = {};
    }

    if (!response.ok) {
      throw new BusinessException(
        ErrorCodes.CMS_PUBLISH_FAILED,
        `Shopify GraphQL 失败：HTTP ${response.status}${bodyText ? ` — ${bodyText.slice(0, 200)}` : ''}`,
      );
    }

    const gqlError = payload.errors?.[0]?.message;
    if (gqlError) {
      throw new BusinessException(ErrorCodes.CMS_PUBLISH_FAILED, `Shopify GraphQL 错误：${gqlError}`);
    }

    if (!payload.data) {
      throw new BusinessException(ErrorCodes.CMS_PUBLISH_FAILED, 'Shopify GraphQL 响应为空');
    }

    return payload.data;
  }
}
