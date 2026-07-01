/**
 * 应用层密钥加密（AES-256-GCM，密钥由 SECRET_CIPHER_KEY 或 AUTH_JWT_SECRET 派生）。
 *
 * 边界：
 * - 不负责：KMS / 信封加密（后续可替换实现）
 *
 * 入口：
 * - encryptSecret / decryptSecret
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const PREFIX = 'v1';

function resolveCipherKey(): Buffer {
  const cipherKey = process.env.SECRET_CIPHER_KEY?.trim();
  const jwtSecret = process.env.AUTH_JWT_SECRET?.trim();
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const secret = cipherKey || jwtSecret;

  if (!secret) {
    if (nodeEnv === 'production') {
      throw new Error('生产环境必须设置 SECRET_CIPHER_KEY（或过渡期 AUTH_JWT_SECRET）以加密敏感凭证');
    }
    return scryptSync('dev-secret-cipher-key', 'wm-platform', KEY_LENGTH);
  }

  const salt = cipherKey ? 'wm-platform-secret-cipher-v2' : 'wm-platform-secret-cipher';
  return scryptSync(secret, salt, KEY_LENGTH);
}

/** 加密明文密钥，输出 v1:iv:tag:ciphertext（base64url） */
export function encryptSecret(plain: string): string {
  if (!plain) {
    throw new Error('encryptSecret: 明文不能为空');
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, resolveCipherKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [PREFIX, iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join(':');
}

/** 解密 encryptSecret 输出；若输入为 legacy 明文则原样返回（TODO(2026-09,#gsc-token-migrate) 迁移截止后拒绝明文） */
export function decryptSecret(stored: string): string {
  if (!stored) {
    throw new Error('decryptSecret: 密文不能为空');
  }

  if (!stored.startsWith(`${PREFIX}:`)) {
    const nodeEnv = process.env.NODE_ENV ?? 'development';
    if (nodeEnv === 'production') {
      throw new Error('decryptSecret: 生产环境拒绝明文 legacy 密文，请先运行迁移脚本');
    }
    return stored;
  }

  const parts = stored.split(':');
  if (parts.length !== 4) {
    throw new Error('decryptSecret: 密文格式无效');
  }

  const [, ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, 'base64url');
  const tag = Buffer.from(tagB64, 'base64url');
  const data = Buffer.from(dataB64, 'base64url');

  const decipher = createDecipheriv(ALGORITHM, resolveCipherKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/** 判断是否为加密格式 */
export function isEncryptedSecret(stored: string): boolean {
  return stored.startsWith(`${PREFIX}:`);
}
