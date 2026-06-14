/**
 * [模板] 业务服务。
 *
 * 边界：
 * - 不负责：[填写]
 *
 * 入口：
 * - TemplateService
 */

import { Injectable } from '@nestjs/common';
import { LoggerService } from '../../core/logger/logger.service';
import type { CreateTemplateDto } from './dto/create-template.dto';

@Injectable()
export class TemplateService {
  constructor(private readonly logger: LoggerService) {}

  async create(dto: CreateTemplateDto) {
    this.logger.info('template.create', { action: 'template.create' });
    return { id: 'placeholder', name: dto.name };
  }
}
