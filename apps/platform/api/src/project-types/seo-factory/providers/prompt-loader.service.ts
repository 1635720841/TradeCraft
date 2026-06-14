/**
 * Prompt 模板加载：委托平台 PromptService（DB + Redis + 文件 fallback）。
 *
 * 边界：
 * - 不负责：CRUD 管理（modules/prompt/）
 */

import { Injectable } from '@nestjs/common';
import { PromptService } from '../../../modules/prompt/prompt.service';

@Injectable()
export class PromptLoaderService {
  constructor(private readonly promptService: PromptService) {}

  async load(version: string): Promise<string> {
    return this.promptService.resolveContent(version);
  }
}
