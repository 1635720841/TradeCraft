/**
 * secret-cipher.util 单元测试。
 */

import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const utilPath = pathToFileURL(resolve(apiRoot, 'dist/core/crypto/secret-cipher.util.js')).href;
const { decryptSecret, encryptSecret, isEncryptedSecret } = await import(utilPath);

describe('secret-cipher.util', () => {
  const prevSecret = process.env.AUTH_JWT_SECRET;
  const prevCipherKey = process.env.SECRET_CIPHER_KEY;

  before(() => {
    process.env.AUTH_JWT_SECRET = 'test-secret-for-cipher-unit-test';
    delete process.env.SECRET_CIPHER_KEY;
  });

  after(() => {
    if (prevSecret === undefined) {
      delete process.env.AUTH_JWT_SECRET;
    } else {
      process.env.AUTH_JWT_SECRET = prevSecret;
    }
    if (prevCipherKey === undefined) {
      delete process.env.SECRET_CIPHER_KEY;
    } else {
      process.env.SECRET_CIPHER_KEY = prevCipherKey;
    }
  });

  it('encryptSecret round-trips', () => {
    const plain = 'ya29.refresh-token-example';
    const enc = encryptSecret(plain);
    assert.ok(isEncryptedSecret(enc));
    assert.equal(decryptSecret(enc), plain);
  });

  it('decryptSecret passes through legacy plaintext', () => {
    const legacy = 'plain-refresh-token';
    assert.equal(decryptSecret(legacy), legacy);
  });

  it('different plaintexts produce different ciphertexts', () => {
    const a = encryptSecret('token-a');
    const b = encryptSecret('token-b');
    assert.notEqual(a, b);
  });

  it('SECRET_CIPHER_KEY takes priority over AUTH_JWT_SECRET', () => {
    process.env.SECRET_CIPHER_KEY = 'dedicated-cipher-key';
    const plain = 'priority-test-token';
    const ciphertext = encryptSecret(plain);
    assert.equal(decryptSecret(ciphertext), plain);

    process.env.AUTH_JWT_SECRET = 'different-jwt-secret';
    assert.equal(decryptSecret(ciphertext), plain);

    delete process.env.SECRET_CIPHER_KEY;
    process.env.AUTH_JWT_SECRET = 'test-secret-for-cipher-unit-test';
    assert.throws(() => decryptSecret(ciphertext));
  });
});
