/**
 * LLM 原创表达优化适配器（QuillBot 等价能力，M7）。
 *
 * 边界：
 * - 不负责：工作流编排（ParaphraseService）
 *
 * 入口：
 * - LlmParaphraseAdapter
 */

import { Injectable } from '@nestjs/common';
import type {
  IParaphraseProvider,
  ParaphraseInput,
  ParaphraseOutput,
  ParaphraseValidateInput,
  ParaphraseValidateOutput,
} from '@wm/provider-interfaces';
import { OpenAiCompatibleAdapter } from '../llm/openai-compatible.adapter';

@Injectable()
export class LlmParaphraseAdapter implements IParaphraseProvider {
  constructor(private readonly llmAdapter: OpenAiCompatibleAdapter) {}

  paraphrase(input: ParaphraseInput): Promise<ParaphraseOutput> {
    return this.llmAdapter.generateParaphrase(input);
  }

  validate(input: ParaphraseValidateInput): Promise<ParaphraseValidateOutput> {
    return this.llmAdapter.validateParaphrase(input);
  }
}
