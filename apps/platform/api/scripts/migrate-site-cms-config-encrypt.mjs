/**
 * 将 Site.cmsConfig 中明文 accessToken / applicationPassword 加密为 v1 格式。
 * 用法：cd apps/platform/api && pnpm build && node scripts/migrate-site-cms-config-encrypt.mjs
 */

import { PrismaClient } from '@prisma/client';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { encryptStoredCmsConfig } = require(
  resolve(apiRoot, 'dist/project-types/seo-factory/modules/site/site-cms.util.js'),
);
const { isEncryptedSecret } = require(
  resolve(apiRoot, 'dist/core/crypto/secret-cipher.util.js'),
);

const prisma = new PrismaClient();

function needsEncryption(cmsType, cmsConfig) {
  if (!cmsConfig || typeof cmsConfig !== 'object') return false;
  const raw = cmsConfig;
  if (cmsType === 'shopify') {
    const token = typeof raw.accessToken === 'string' ? raw.accessToken.trim() : '';
    return Boolean(token && !isEncryptedSecret(token));
  }
  if (cmsType === 'wordpress') {
    const password =
      typeof raw.applicationPassword === 'string' ? raw.applicationPassword.trim() : '';
    return Boolean(password && !isEncryptedSecret(password));
  }
  return false;
}

async function main() {
  const sites = await prisma.site.findMany({
    where: { cmsType: { in: ['shopify', 'wordpress'] } },
    select: { id: true, domain: true, cmsType: true, cmsConfig: true },
  });

  let updated = 0;
  let skipped = 0;

  for (const site of sites) {
    if (!needsEncryption(site.cmsType, site.cmsConfig)) {
      skipped += 1;
      continue;
    }

    const encrypted = encryptStoredCmsConfig(site.cmsType, site.cmsConfig);
    if (!encrypted) {
      skipped += 1;
      continue;
    }

    await prisma.site.update({
      where: { id: site.id },
      data: { cmsConfig: encrypted },
    });
    updated += 1;
    console.log(`已加密站点 CMS 凭证: ${site.domain} (${site.cmsType})`);
  }

  console.log(`完成：加密 ${updated} 条，跳过 ${skipped} 条`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
