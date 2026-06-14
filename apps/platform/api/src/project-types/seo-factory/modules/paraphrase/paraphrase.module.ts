/**
 * QuillBot 原创表达优化模块（M7）。
 */

import { Module } from '@nestjs/common';
import { SeoFactoryProvidersModule } from '../../providers/seo-factory-providers.module';
import { ParaphraseService } from './paraphrase.service';

@Module({
  imports: [SeoFactoryProvidersModule],
  providers: [ParaphraseService],
  exports: [ParaphraseService],
})
export class ParaphraseModule {}
