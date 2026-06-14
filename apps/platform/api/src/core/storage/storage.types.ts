/**
 * 对象存储抽象类型。
 *
 * 边界：
 * - 不负责：具体存储实现（LocalStorageService / 未来 S3）
 */

export interface StoredObject {
  body: Buffer;
  contentType: string;
}

export interface PutObjectResult {
  /** 存储层内部 key（org/project/job/...） */
  key: string;
}
