/**
 * 对象存储门面：S3 已配置时走 S3，否则本地磁盘 fallback。
 *
 * 边界：
 * - 不负责：导出 HTML 拼装（export 模块）
 */

import { Injectable, Optional } from '@nestjs/common';
import { LocalStorageService } from './local-storage.service';
import { S3StorageService } from './s3-storage.service';
import type { PutObjectResult, StoredObject } from './storage.types';

@Injectable()
export class StorageService {
  constructor(
    private readonly localStorage: LocalStorageService,
    @Optional() private readonly s3Storage: S3StorageService | null,
  ) {}

  async putObject(key: string, body: Buffer, contentType: string): Promise<PutObjectResult> {
    if (this.s3Storage) {
      return this.s3Storage.putObject(key, body, contentType);
    }
    return this.localStorage.putObject(key, body, contentType);
  }

  async getObject(key: string): Promise<StoredObject | null> {
    if (this.s3Storage) {
      return this.s3Storage.getObject(key);
    }
    return this.localStorage.getObject(key);
  }

  /** 当前是否使用 S3（供日志/诊断） */
  isUsingS3(): boolean {
    return Boolean(this.s3Storage);
  }
}
