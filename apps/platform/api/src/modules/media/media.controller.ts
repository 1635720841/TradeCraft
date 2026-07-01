/**
 * 项目媒体资产库 HTTP 入口。
 */

import {
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type { RequestContext } from '@wm/shared-core';
import { Public } from '../../core/decorators/public.decorator';
import { ReqCtx } from '../../core/decorators/request-context.decorator';
import { UnauthorizedException } from '../../core/exceptions/auth.exception';
import { BusinessException } from '../../core/exceptions/business.exception';
import { ErrorCodes } from '../../core/exceptions/error-codes';
import { ProjectService } from '../project/project.service';
import { MEDIA_ASSET_MAX_BYTES } from './constants/media-asset';
import { ListMediaAssetsQueryDto } from './dto/list-media-assets.dto';
import { MediaIngestService } from './media-ingest.service';
import { MediaService } from './media.service';
import { MediaAssetSource } from '@prisma/client';
import { verifyMediaAssetSignedQuery } from './media-url.util';

@Controller('api/v1/projects/:projectId/media')
export class MediaController {
  constructor(
    private readonly projectService: ProjectService,
    private readonly mediaService: MediaService,
    private readonly mediaIngestService: MediaIngestService,
  ) {}

  @Get()
  async list(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Query() query: ListMediaAssetsQueryDto,
  ) {
    await this.projectService.assertProjectMediaRead(ctx.organizationId, projectId, ctx);
    const result = await this.mediaService.list(
      ctx.organizationId,
      projectId,
      query.page,
      query.limit,
      query.source as MediaAssetSource | undefined,
    );
    return {
      data: result.items,
      meta: {
        traceId: ctx.traceId,
        pagination: { page: result.page, limit: result.limit, total: result.total },
      },
    };
  }

  @Get(':assetId')
  async getOne(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('assetId') assetId: string,
  ) {
    await this.projectService.assertProjectMediaRead(ctx.organizationId, projectId, ctx);
    const data = await this.mediaService.getOne(ctx.organizationId, projectId, assetId);
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MEDIA_ASSET_MAX_BYTES },
    }),
  )
  async upload(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    await this.projectService.assertProjectMediaWrite(ctx.organizationId, projectId, ctx);

    if (!file?.buffer?.length) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '请选择要上传的图片');
    }

    const contentType = file.mimetype?.trim().toLowerCase() ?? 'image/jpeg';
    const ingested = await this.mediaIngestService.ingestFromBuffer({
      organizationId: ctx.organizationId,
      projectId,
      buffer: file.buffer,
      contentType,
      source: MediaAssetSource.UPLOAD,
      createdBy: ctx.userId,
    });

    const data = await this.mediaService.getOne(
      ctx.organizationId,
      projectId,
      ingested.assetId,
    );

    return { data, meta: { traceId: ctx.traceId } };
  }

  @Delete(':assetId')
  async deleteOne(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('assetId') assetId: string,
  ) {
    await this.projectService.assertProjectMediaWrite(ctx.organizationId, projectId, ctx);
    await this.mediaService.deleteAsset(ctx.organizationId, projectId, assetId);
    return { data: { id: assetId }, meta: { traceId: ctx.traceId } };
  }

  @Public()
  @Get(':assetId/file')
  @Header('Cache-Control', 'private, max-age=3600')
  async serveFile(
    @Param('projectId') projectId: string,
    @Param('assetId') assetId: string,
    @Query('exp') exp: string | undefined,
    @Query('sig') sig: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (!verifyMediaAssetSignedQuery(projectId, assetId, exp, sig)) {
      throw new UnauthorizedException(ErrorCodes.UNAUTHORIZED, '图片链接无效或已过期');
    }

    const asset = await this.mediaService.getOneForPublicServe(projectId, assetId);
    const file = await this.mediaService.getObjectBytes(
      asset.organizationId,
      projectId,
      assetId,
    );
    res.setHeader('Content-Type', file.contentType);
    res.send(file.body);
  }
}
