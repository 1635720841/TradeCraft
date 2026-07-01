/**
 * 配图模块（M9：Semrush 终检前通过 BFL 官方 API 补足 SWA 图片）。
 *
 * 边界：
 * - 不负责：导出打包（export 模块）
 */

import { Module } from '@nestjs/common';
import { MediaModule } from '../../../../modules/media/media.module';
import { SeoFactoryProvidersModule } from '../../providers/seo-factory-providers.module';
import { IllustrationService } from './illustration.service';

@Module({
  imports: [SeoFactoryProvidersModule, MediaModule],
  providers: [IllustrationService],
  exports: [IllustrationService],
})
export class IllustrationModule {}
