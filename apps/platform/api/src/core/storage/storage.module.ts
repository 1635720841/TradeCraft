/**
 * 对象存储模块。
 */

import { Global, Module } from '@nestjs/common';
import { LocalStorageService } from './local-storage.service';
import { StorageService } from './storage.service';

@Global()
@Module({
  providers: [LocalStorageService, StorageService],
  exports: [StorageService],
})
export class StorageModule {}
