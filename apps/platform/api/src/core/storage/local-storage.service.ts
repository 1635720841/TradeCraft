/**
 * 本地磁盘对象存储（开发/无 S3 时 fallback）。
 *
 * 边界：
 * - 不负责：HTTP 下载路由（ExportService / Controller）
 */

import { Injectable } from '@nestjs/common';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { PutObjectResult, StoredObject } from './storage.types';

@Injectable()
export class LocalStorageService {
  private readonly rootDir: string;

  constructor() {
    this.rootDir =
      process.env.EXPORT_STORAGE_DIR?.trim() ||
      path.join(process.cwd(), '.data', 'exports');
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<PutObjectResult> {
    const filePath = this.resolvePath(key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, body);
    await writeFile(`${filePath}.meta.json`, JSON.stringify({ contentType }), 'utf8');
    return { key };
  }

  async getObject(key: string): Promise<StoredObject | null> {
    const filePath = this.resolvePath(key);
    try {
      const [body, metaRaw] = await Promise.all([
        readFile(filePath),
        readFile(`${filePath}.meta.json`, 'utf8'),
      ]);
      const meta = JSON.parse(metaRaw) as { contentType?: string };
      return { body, contentType: meta.contentType ?? 'application/octet-stream' };
    } catch {
      return null;
    }
  }

  private resolvePath(key: string): string {
    const normalized = key.replace(/\\/g, '/').replace(/^\/+/, '');
    const segments = normalized.split('/').filter(Boolean);
    if (segments.some((segment) => segment === '..')) {
      throw new Error('Invalid storage key');
    }
    return path.join(this.rootDir, ...segments);
  }
}
