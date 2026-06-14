/**
 * [模板] HTTP 入口：接收请求，转发至 TemplateService。
 *
 * 边界：
 * - 不负责：业务逻辑、数据库操作
 *
 * 入口：
 * - TemplateController
 */

import { Body, Controller, Post } from '@nestjs/common';
import { CreateTemplateDto } from './dto/create-template.dto';
import { TemplateService } from './template.service';

@Controller('api/v1/platform/templates')
export class TemplateController {
  constructor(private readonly templateService: TemplateService) {}

  @Post()
  async create(@Body() dto: CreateTemplateDto) {
    const result = await this.templateService.create(dto);
    return { data: result, meta: { traceId: 'pending' } };
  }
}
