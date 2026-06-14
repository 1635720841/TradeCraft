/**
 * 对象存储门面：本地磁盘为主，S3 配置项预留。
 *
 * 边界：
 * - 不负责：导出 HTML 拼装（export 模块）
 */

import { Injectable } from '@nestjs/common';
import { LoggerService } from '../logger/logger.service';
import { LocalStorageService } from './local-storage.service';
import type { PutObjectResult, StoredObject } from './storage.types';

@Injectable()
export class StorageService {
  constructor(
    private readonly localStorage: LocalStorageService,
    private readonly logger: LoggerService,
  ) {}

  async putObject(key: string, body: Buffer, contentType: string): Promise<PutObjectResult> {
    const bucket = process.env.S3_BUCKET?.trim();
    if (bucket) {
      this.logger.warn('S3_BUCKET 已配置但尚未接入 SDK，回退本地存储', {
        action: 'storage.s3_fallback',
        bucket,
      });
    }
    return this.localStorage.putObject(key, body, contentType);
  }

  async getObject(key: string): Promise<StoredObject | null> {
    return this.localStorage.getObject(key);
  }
}
