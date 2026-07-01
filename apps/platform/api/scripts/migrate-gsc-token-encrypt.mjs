/**
 * 将 PlatformGscCredential 中明文 refresh token 加密为 v1 格式。
 * 用法：cd apps/platform/api && pnpm build && node scripts/migrate-gsc-token-encrypt.mjs
 */

import { PrismaClient } from '@prisma/client';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { encryptSecret, isEncryptedSecret } = require(
  resolve(apiRoot, 'dist/core/crypto/secret-cipher.util.js'),
);

const PLATFORM_CREDENTIAL_ID = 'default';
const prisma = new PrismaClient();

async function main() {
  const credential = await prisma.platformGscCredential.findUnique({
    where: { id: PLATFORM_CREDENTIAL_ID },
    select: { refreshTokenEnc: true },
  });

  if (!credential?.refreshTokenEnc) {
    console.log('无平台 GSC 凭证，跳过');
    return;
  }

  if (isEncryptedSecret(credential.refreshTokenEnc)) {
    console.log('refresh token 已加密，跳过');
    return;
  }

  const encrypted = encryptSecret(credential.refreshTokenEnc);
  await prisma.platformGscCredential.update({
    where: { id: PLATFORM_CREDENTIAL_ID },
    data: { refreshTokenEnc: encrypted },
  });
  console.log('已加密平台 GSC refresh token');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
