/**
 * SEO 查分模块：本地评分 + Semrush 终检。
 */

import { Module } from '@nestjs/common';
import { SeoFactoryProvidersModule } from '../../providers/seo-factory-providers.module';
import { LlmModule } from '../llm/llm.module';
import { SeoCheckerService } from './seo-checker.service';

@Module({
  imports: [LlmModule, SeoFactoryProvidersModule],
  providers: [SeoCheckerService],
  exports: [SeoCheckerService],
})
export class SeoCheckerModule {}
