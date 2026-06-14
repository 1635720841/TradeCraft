/**
 * LLM 模块：M4-M5 Brief 与初稿。
 *
 * 边界：
 * - 不负责：Provider 实现（SeoFactoryProvidersModule）
 */

import { Module } from '@nestjs/common';
import { SeoFactoryProvidersModule } from '../../providers/seo-factory-providers.module';
import { LlmService } from './llm.service';

@Module({
  imports: [SeoFactoryProvidersModule],
  providers: [LlmService],
  exports: [LlmService],
})
export class LlmModule {}
