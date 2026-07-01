/**
 * 项目媒体资产库模块（平台层，跨项目类型复用）。
 */

import { Module } from '@nestjs/common';
import { ProjectModule } from '../project/project.module';
import { MediaController } from './media.controller';
import { MediaIngestService } from './media-ingest.service';
import { MediaService } from './media.service';

@Module({
  imports: [ProjectModule],
  controllers: [MediaController],
  providers: [MediaService, MediaIngestService],
  exports: [MediaService, MediaIngestService],
})
export class MediaModule {}
