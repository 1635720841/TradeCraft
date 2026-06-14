/**
 * M12 Prompt 版本库模块。
 */

import { Module } from '@nestjs/common';
import { PromptBindingService } from './prompt-binding.service';
import { PromptController } from './prompt.controller';
import { PromptService } from './prompt.service';

@Module({
  controllers: [PromptController],
  providers: [PromptService, PromptBindingService],
  exports: [PromptService, PromptBindingService],
})
export class PromptModule {}
