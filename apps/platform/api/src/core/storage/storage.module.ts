/**
 * 对象存储模块。
 */

import { Global, Module } from '@nestjs/common';
import { LoggerService } from '../logger/logger.service';
import { LocalStorageService } from './local-storage.service';
import { S3StorageService } from './s3-storage.service';
import { StorageService } from './storage.service';

function createS3Storage(logger: LoggerService): S3StorageService | null {
  const bucket = process.env.S3_BUCKET?.trim();
  if (!bucket) return null;

  try {
    const service = new S3StorageService();
    logger.info('Object storage backend: S3', {
      action: 'storage.s3_enabled',
      bucket,
      region: process.env.S3_REGION?.trim() || 'us-east-1',
      endpoint: process.env.S3_ENDPOINT?.trim() || undefined,
    });
    return service;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    logger.warn('S3 配置无效，回退本地存储', {
      action: 'storage.s3_init_failed',
      bucket,
      error: message,
    });
    return null;
  }
}

@Global()
@Module({
  providers: [
    LocalStorageService,
    {
      provide: S3StorageService,
      useFactory: (logger: LoggerService) => createS3Storage(logger),
      inject: [LoggerService],
    },
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}
