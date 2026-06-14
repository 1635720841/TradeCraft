/**
 * 开发环境种子数据（MJS，无需 ts-node）。
 * 可重复执行：仅补齐缺失的开发账号/项目/站点，不删除已有 ArticleJob。
 *
 * 强制清空开发数据：RESET_DEV_DATA=true pnpm db:seed
 */

import { scryptSync } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { PrismaClient } from '@prisma/client';

/** 当前开发种子 ID（合法 UUID v4） */
const MVP_ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const MVP_PROJECT_ID = '00000000-0000-4000-8000-000000000002';
const MVP_SITE_ID = '00000000-0000-4000-8000-000000000003';
const MVP_USER_ID = '00000000-0000-4000-8000-000000000004';
const DEV_USER_EMAIL = 'admin@dev.local';
const DEV_USER_PASSWORD = 'admin123';

const PROMPT_LABELS = {
  seo_brief_v1: 'SEO Brief v1',
  seo_draft_v1: 'SEO 初稿 v1',
  seo_optimize_v1: 'SEO 优化 v1',
  seo_optimize_v2: 'SEO 优化 v2',
  seo_optimize_v3: 'SEO 优化 v3',
  seo_optimize_semrush_v1: 'Semrush 优化 v1',
  seo_rewrite_v1: 'AI 改写 v1',
};

const PROMPT_DEFAULT_BINDINGS = {
  brief: 'seo_brief_v1',
  draft: 'seo_draft_v1',
  localOptimize: 'seo_optimize_v3',
  semrushOptimize: 'seo_optimize_semrush_v1',
  rewrite: 'seo_rewrite_v1',
};

/** 旧版开发种子 ID（已废弃，仅清理 legacy） */
const LEGACY_ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';
const LEGACY_PROJECT_ID = '00000000-0000-0000-0000-000000000002';
const LEGACY_SITE_ID = '00000000-0000-0000-0000-000000000003';

function hashPassword(password) {
  const salt = scryptSync(password, 'wm-auth-salt', 16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

const prisma = new PrismaClient();

async function cleanupLegacyDevData() {
  await prisma.articleJob.deleteMany({ where: { projectId: LEGACY_PROJECT_ID } });
  await prisma.site.deleteMany({ where: { id: LEGACY_SITE_ID } });
  await prisma.project.deleteMany({ where: { id: LEGACY_PROJECT_ID } });
  await prisma.organization.deleteMany({ where: { id: LEGACY_ORGANIZATION_ID } });
}

async function resetMvpDevData() {
  await prisma.user.deleteMany({ where: { organizationId: MVP_ORGANIZATION_ID } });
  await prisma.articleJob.deleteMany({ where: { projectId: MVP_PROJECT_ID } });
  await prisma.site.deleteMany({ where: { id: MVP_SITE_ID } });
  await prisma.project.deleteMany({ where: { id: MVP_PROJECT_ID } });
  await prisma.organization.deleteMany({ where: { id: MVP_ORGANIZATION_ID } });
}

async function ensureMvpDevData() {
  await prisma.organization.upsert({
    where: { id: MVP_ORGANIZATION_ID },
    create: { id: MVP_ORGANIZATION_ID, name: 'MVP 开发企业' },
    update: {},
  });

  await prisma.user.upsert({
    where: { email: DEV_USER_EMAIL },
    create: {
      id: MVP_USER_ID,
      email: DEV_USER_EMAIL,
      name: '开发管理员',
      passwordHash: hashPassword(DEV_USER_PASSWORD),
      organizationId: MVP_ORGANIZATION_ID,
      role: 'ADMIN',
    },
    update: {
      name: '开发管理员',
      passwordHash: hashPassword(DEV_USER_PASSWORD),
      organizationId: MVP_ORGANIZATION_ID,
      role: 'ADMIN',
    },
  });

  await prisma.project.upsert({
    where: { id: MVP_PROJECT_ID },
    create: {
      id: MVP_PROJECT_ID,
      organizationId: MVP_ORGANIZATION_ID,
      name: 'SEO 内容工厂（开发）',
      projectType: 'seo-factory',
    },
    update: {
      organizationId: MVP_ORGANIZATION_ID,
      name: 'SEO 内容工厂（开发）',
      projectType: 'seo-factory',
      status: 'ACTIVE',
    },
  });

  await prisma.site.upsert({
    where: { id: MVP_SITE_ID },
    create: {
      id: MVP_SITE_ID,
      organizationId: MVP_ORGANIZATION_ID,
      projectId: MVP_PROJECT_ID,
      domain: 'example.com',
      brandVoice: 'professional, trustworthy, B2B decision-makers',
      targetMarket: 'US',
      contentLanguage: 'en',
    },
    update: {
      organizationId: MVP_ORGANIZATION_ID,
      projectId: MVP_PROJECT_ID,
      domain: 'example.com',
      brandVoice: 'professional, trustworthy, B2B decision-makers',
      targetMarket: 'US',
      contentLanguage: 'en',
    },
  });
}

async function ensurePromptTemplates() {
  const dir = join(process.cwd(), 'prompts');
  let files;
  try {
    files = await readdir(dir);
  } catch {
    console.log('[seed] prompts/ 目录不存在，跳过 Prompt 种子');
    return;
  }

  let created = 0;
  for (const file of files) {
    if (!file.endsWith('.md')) continue;
    const version = basename(file, '.md');
    const content = await readFile(join(dir, file), 'utf8');
    const existing = await prisma.promptTemplate.findUnique({ where: { version } });
    if (existing && process.env.FORCE_PROMPT_SEED !== 'true') {
      continue;
    }
    await prisma.promptTemplate.upsert({
      where: { version },
      create: {
        version,
        name: PROMPT_LABELS[version] ?? version,
        content,
        isActive: true,
      },
      update: {
        name: PROMPT_LABELS[version] ?? version,
        content,
        isActive: true,
      },
    });
    created += 1;
  }
  console.log(`[seed] Prompt 模板已同步 ${created} 条（FORCE_PROMPT_SEED=true 可覆盖已有内容）`);
}

async function ensurePromptBindings() {
  for (const [slotId, activeVersion] of Object.entries(PROMPT_DEFAULT_BINDINGS)) {
    await prisma.promptRuntimeBinding.upsert({
      where: { slotId },
      create: { slotId, activeVersion },
      update: {},
    });
  }
  console.log('[seed] Prompt 功能绑定已就绪（可在运营台切换版本）');
}

await cleanupLegacyDevData();

if (process.env.RESET_DEV_DATA === 'true') {
  console.log('[seed] RESET_DEV_DATA=true，清空 MVP 开发数据（含 ArticleJob）');
  await resetMvpDevData();
}

await ensureMvpDevData();
await ensurePromptTemplates();
await ensurePromptBindings();

const jobCount = await prisma.articleJob.count({
  where: { projectId: MVP_PROJECT_ID },
});

console.log('[seed] 开发数据已就绪');
console.log(`  登录账号: ${DEV_USER_EMAIL}`);
console.log(`  登录密码: ${DEV_USER_PASSWORD}`);
console.log(`  项目 ID: ${MVP_PROJECT_ID}`);
console.log(`  站点 ID: ${MVP_SITE_ID}`);
console.log(`  当前项目下 ArticleJob 数量: ${jobCount}`);
console.log('  提示：db:seed 默认不删文章；仅 RESET_DEV_DATA=true 时清空');

await prisma.$disconnect();
