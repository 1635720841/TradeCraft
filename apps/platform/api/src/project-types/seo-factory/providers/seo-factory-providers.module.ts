/**
 * seo-factory 外部服务 Provider 注册：Serper、LLM、BFL 等适配器 DI 绑定。
 *
 * 边界：
 * - 不负责：业务编排（由 WorkflowModule 处理）
 *
 * 入口：
 * - SeoFactoryProvidersModule
 */

import { Module } from '@nestjs/common';
import { IMAGE_PROVIDER, LLM_PROVIDER, SEO_CHECKER_PROVIDER, SERP_PROVIDER } from '@wm/provider-interfaces';
import { PromptModule } from '../../../modules/prompt/prompt.module';
import { BflImageAdapter } from './bfl/bfl-image.adapter';
import { OpenAiCompatibleAdapter } from './llm/openai-compatible.adapter';
import { PromptLoaderService } from './prompt-loader.service';
import { SemrushRpaAdapter } from './semrush/semrush-rpa.adapter';
import { SemrushSessionManager } from './semrush/semrush-session.manager';
import { SemrushStubAdapter } from './semrush/semrush.stub.adapter';
import { SerperAdapter } from './serper/serper.adapter';

@Module({
  imports: [PromptModule],
  providers: [
    PromptLoaderService,
    SerperAdapter,
    OpenAiCompatibleAdapter,
    BflImageAdapter,
    SemrushSessionManager,
    SemrushStubAdapter,
    SemrushRpaAdapter,
    { provide: SERP_PROVIDER, useExisting: SerperAdapter },
    { provide: LLM_PROVIDER, useExisting: OpenAiCompatibleAdapter },
    { provide: IMAGE_PROVIDER, useExisting: BflImageAdapter },
    {
      provide: SEO_CHECKER_PROVIDER,
      useFactory: (stub: SemrushStubAdapter, rpa: SemrushRpaAdapter) =>
        process.env.SEMRUSH_ENABLED === 'true' ? rpa : stub,
      inject: [SemrushStubAdapter, SemrushRpaAdapter],
    },
  ],
  exports: [
    SERP_PROVIDER,
    LLM_PROVIDER,
    IMAGE_PROVIDER,
    SEO_CHECKER_PROVIDER,
    PromptLoaderService,
  ],
})
export class SeoFactoryProvidersModule {}
