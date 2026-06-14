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
import {
  IMAGE_PROVIDER,
  KEYWORD_METRICS_PROVIDER,
  LLM_PROVIDER,
  PARAPHRASE_PROVIDER,
  SEO_CHECKER_PROVIDER,
  SERP_PROVIDER,
} from '@wm/provider-interfaces';
import { PromptModule } from '../../../modules/prompt/prompt.module';
import { BflImageAdapter } from './bfl/bfl-image.adapter';
import { SemrushApiKeywordMetricsAdapter } from './keyword-metrics/semrush-api.adapter';
import { StubKeywordMetricsAdapter } from './keyword-metrics/stub.adapter';
import { LlmParaphraseAdapter } from './paraphrase/llm-paraphrase.adapter';
import { OpenAiCompatibleAdapter } from './llm/openai-compatible.adapter';
import { PromptLoaderService } from './prompt-loader.service';
import { SemrushRpaAdapter } from './semrush/semrush-rpa.adapter';
import { SemrushBrowserPool } from './semrush/semrush-browser-pool';
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
    SemrushBrowserPool,
    SemrushStubAdapter,
    SemrushRpaAdapter,
    SemrushApiKeywordMetricsAdapter,
    StubKeywordMetricsAdapter,
    LlmParaphraseAdapter,
    { provide: SERP_PROVIDER, useExisting: SerperAdapter },
    { provide: LLM_PROVIDER, useExisting: OpenAiCompatibleAdapter },
    { provide: IMAGE_PROVIDER, useExisting: BflImageAdapter },
    {
      provide: SEO_CHECKER_PROVIDER,
      useFactory: (stub: SemrushStubAdapter, rpa: SemrushRpaAdapter) =>
        process.env.SEMRUSH_ENABLED === 'true' ? rpa : stub,
      inject: [SemrushStubAdapter, SemrushRpaAdapter],
    },
    {
      provide: KEYWORD_METRICS_PROVIDER,
      useFactory: (api: SemrushApiKeywordMetricsAdapter, stub: StubKeywordMetricsAdapter) =>
        process.env.SEMRUSH_API_KEY?.trim() ? api : stub,
      inject: [SemrushApiKeywordMetricsAdapter, StubKeywordMetricsAdapter],
    },
    { provide: PARAPHRASE_PROVIDER, useExisting: LlmParaphraseAdapter },
  ],
  exports: [
    SERP_PROVIDER,
    LLM_PROVIDER,
    IMAGE_PROVIDER,
    SEO_CHECKER_PROVIDER,
    KEYWORD_METRICS_PROVIDER,
    PARAPHRASE_PROVIDER,
    PromptLoaderService,
  ],
})
export class SeoFactoryProvidersModule {}
