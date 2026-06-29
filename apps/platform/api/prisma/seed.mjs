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
import Redis from 'ioredis';

/** 当前开发种子 ID（合法 UUID v4） */
const MVP_ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const MVP_PROJECT_ID = '00000000-0000-4000-8000-000000000002';
const MVP_SITE_ID = '00000000-0000-4000-8000-000000000003';
const MVP_USER_ID = '00000000-0000-4000-8000-000000000004';
const MVP_MEMBER_USER_ID = '00000000-0000-4000-8000-000000000005';
const MVP_OUTSIDER_USER_ID = '00000000-0000-4000-8000-000000000006';
const PLATFORM_ORG_ID = '00000000-0000-4000-8000-000000000010';
const SUPER_USER_ID = '00000000-0000-4000-8000-000000000011';
const PLATFORM_OPS_USER_ID = '00000000-0000-4000-8000-000000000012';
const DEV_USER_EMAIL = 'admin@dev.local';
const DEV_USER_PASSWORD = 'admin123';
const DEV_MEMBER_EMAIL = 'member@dev.local';
const DEV_MEMBER_PASSWORD = 'member123';
const DEV_OUTSIDER_EMAIL = 'outsider@dev.local';
const DEV_OUTSIDER_PASSWORD = 'outsider123';
const SUPER_USER_EMAIL = 'super@dev.local';
const SUPER_USER_PASSWORD = 'super123';
const PLATFORM_OPS_EMAIL = 'ops@dev.local';
const PLATFORM_OPS_PASSWORD = 'ops123';

const PROMPT_LABELS = {
  seo_brief_v1: 'SEO Brief v1',
  seo_draft_v1: 'SEO 初稿 v1',
  seo_optimize_v1: 'SEO 优化 v1',
  seo_optimize_v2: 'SEO 优化 v2',
  seo_optimize_v3: 'SEO 优化 v3',
  seo_optimize_calibrated_v1: 'SEO 优化（Sem 校准对齐）v1',
  seo_optimize_semrush_v1: 'Semrush 优化 v1',
  seo_rewrite_v1: 'AI 改写 v1',
  seo_keyword_seed_v1: '关键词种子 v1',
  seo_quillbot_v1: 'QuillBot 优化 v1',
  seo_quillbot_validate_v1: 'QuillBot 复检 v1',
};

const PROMPT_DEFAULT_BINDINGS = {
  brief: 'seo_brief_v1',
  draft: 'seo_draft_v1',
  localOptimize: 'seo_optimize_v3',
  semrushOptimize: 'seo_optimize_semrush_v1',
  rewrite: 'seo_rewrite_v1',
  keywordSeed: 'seo_keyword_seed_v1',
  quillbot: 'seo_quillbot_v1',
  quillbotValidate: 'seo_quillbot_validate_v1',
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

async function ensureCatalogs() {
  const permissions = [
    ['org:profile:read', '查看企业资料', 'org', '查看本企业信息', 10],
    ['org:profile:update', '编辑企业资料', 'org', '修改企业名称', 11],
    ['org:member:list', '成员列表', 'org', '查看企业成员', 20],
    ['org:member:create', '添加成员', 'org', '邀请或创建成员', 21],
    ['org:member:update', '编辑成员', 'org', '修改成员信息', 22],
    ['org:member:grant', '授权成员', 'org', '为成员分配权限', 23],
    ['org:billing:read', '查看订阅与配额', 'org', '查看套餐、账期、用量明细', 30],
    ['org:billing:manage', '管理订阅与配额', 'org', '仅平台 Console 运营（租户侧不可授）', 31],
    ['console:tenant:list', '租户列表', 'console', '查看全平台租户', 40],
    ['console:tenant:read', '租户详情', 'console', '查看租户详情', 41],
    ['console:tenant:create', '新建租户', 'console', '创建租户与管理员', 42],
    ['console:tenant:update', '编辑租户', 'console', '修改套餐与账期', 43],
    ['console:menu:manage', '菜单管理', 'console', '按账号配置侧栏菜单', 44],
    ['console:prompt:read', '查看 Prompt', 'console', '查看 Prompt 模板', 50],
    ['console:prompt:manage', '管理 Prompt', 'console', '编辑 Prompt 与绑定', 51],
    ['console:audit:read', '操作审计', 'console', '查看平台操作日志', 52],
    ['project:create', '创建项目', 'project', '创建企业项目', 60],
    ['project:read', '查看项目', 'project', '查看项目列表与详情', 61],
    ['project:update', '编辑项目', 'project', '归档或更新项目', 62],
    ['seo:job:create', '创建任务', 'seo', '创建文章任务', 70],
    ['seo:job:read', '查看任务', 'seo', '查看文章任务', 71],
    ['seo:job:review', '审核任务', 'seo', '确认大纲与敏感审核', 72],
    ['seo:keyword:manage', '管理词库', 'seo', '关键词与聚类管理', 73],
    ['seo:site:manage', '管理站点', 'seo', '站点配置与页面库', 74],
  ];

  for (const [id, name, module, description, sortOrder] of permissions) {
    await prisma.permission.upsert({
      where: { id },
      create: { id, name, module, description, sortOrder },
      update: { name, module, description, sortOrder },
    });
  }

  const plans = [
    ['trial', '试用版', 100, 'MONTHLY', 0],
    ['standard', '标准版', 500, 'MONTHLY', 1],
    ['enterprise', '企业版', 2000, 'YEARLY', 2],
  ];
  for (const [id, name, quota, billingCycle, sortOrder] of plans) {
    await prisma.subscriptionPlan.upsert({
      where: { id },
      create: { id, name, monthlyArticleQuota: quota, billingCycle, sortOrder },
      update: { name, monthlyArticleQuota: quota, billingCycle, sortOrder },
    });
  }

  const menus = [
    ['org:profile', '企业资料', '/org/profile', 'org:profile:read', ['ADMIN', 'SUPER_ADMIN', 'MEMBER'], 10],
    ['org:members', '成员与权限', '/org/members', 'org:member:list', ['ADMIN', 'SUPER_ADMIN'], 11],
    ['org:projects', '项目管理', '/org/projects', 'project:read', ['ADMIN', 'SUPER_ADMIN', 'MEMBER'], 12],
    ['org:billing', '订阅与配额', '/org/billing', 'org:billing:read', ['ADMIN', 'SUPER_ADMIN', 'MEMBER'], 13],
    ['console:overview', '运营概览', '/console/overview', 'console:tenant:list', ['SUPER_ADMIN', 'PLATFORM_OPERATOR'], 20],
    ['console:tenants', '租户管理', '/console/tenants', 'console:tenant:list', ['SUPER_ADMIN', 'PLATFORM_OPERATOR'], 21],
    ['console:prompts', 'Prompt 运营', '/console/prompts', 'console:prompt:read', ['SUPER_ADMIN'], 22],
    ['console:access', '访问控制', '/console/access', 'console:menu:manage', ['SUPER_ADMIN'], 23],
    ['console:audit', '操作审计', '/console/audit', 'console:audit:read', ['SUPER_ADMIN', 'PLATFORM_OPERATOR'], 24],
  ];

  for (const [id, title, routePath, permissionId, targetRoles, sortOrder] of menus) {
    await prisma.platformMenu.upsert({
      where: { id },
      create: { id, title, routePath, permissionId, targetRoles, sortOrder },
      update: { title, routePath, permissionId, targetRoles, sortOrder },
    });
  }

  const adminMenus = ['org:profile', 'org:members', 'org:projects', 'org:billing'];
  const memberMenus = ['org:profile', 'org:projects'];
  const operatorMenus = ['console:overview', 'console:tenants', 'console:audit'];
  for (const menuId of adminMenus) {
    await prisma.roleMenuGrant.upsert({
      where: { role_menuId: { role: 'ADMIN', menuId } },
      create: { role: 'ADMIN', menuId, enabled: true },
      update: {},
    });
  }
  for (const menuId of memberMenus) {
    await prisma.roleMenuGrant.upsert({
      where: { role_menuId: { role: 'MEMBER', menuId } },
      create: { role: 'MEMBER', menuId, enabled: true },
      update: {},
    });
  }
  for (const menuId of operatorMenus) {
    await prisma.roleMenuGrant.upsert({
      where: { role_menuId: { role: 'PLATFORM_OPERATOR', menuId } },
      create: { role: 'PLATFORM_OPERATOR', menuId, enabled: true },
      update: {},
    });
  }

  console.log('[seed] 权限、套餐与菜单目录已同步');
}

async function ensurePlatformSuperAdmin() {
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  await prisma.organization.upsert({
    where: { id: PLATFORM_ORG_ID },
    create: {
      id: PLATFORM_ORG_ID,
      type: 'PLATFORM',
      name: '平台管理组织',
      planId: 'enterprise',
      planName: 'enterprise',
      monthlyArticleQuota: 999999,
      subscriptionStatus: 'ACTIVE',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    },
    update: {
      type: 'PLATFORM',
      name: '平台管理组织',
    },
  });

  const existingSuper = await prisma.user.findFirst({
    where: { OR: [{ email: SUPER_USER_EMAIL }, { id: SUPER_USER_ID }] },
  });

  const superData = {
    email: SUPER_USER_EMAIL,
    name: '超级管理员',
    passwordHash: hashPassword(SUPER_USER_PASSWORD),
    organizationId: PLATFORM_ORG_ID,
    role: 'SUPER_ADMIN',
    status: 'ACTIVE',
  };

  if (existingSuper) {
    await prisma.user.update({ where: { id: existingSuper.id }, data: superData });
  } else {
    await prisma.user.create({ data: { id: SUPER_USER_ID, ...superData } });
  }

  console.log(`[seed] 超级管理员: ${SUPER_USER_EMAIL} / ${SUPER_USER_PASSWORD}`);
}

async function ensurePlatformOperator() {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: PLATFORM_OPS_EMAIL }, { id: PLATFORM_OPS_USER_ID }] },
  });

  const data = {
    email: PLATFORM_OPS_EMAIL,
    name: '平台管理员',
    passwordHash: hashPassword(PLATFORM_OPS_PASSWORD),
    organizationId: PLATFORM_ORG_ID,
    role: 'PLATFORM_OPERATOR',
    status: 'ACTIVE',
  };

  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data });
  } else {
    await prisma.user.create({ data: { id: PLATFORM_OPS_USER_ID, ...data } });
  }

  console.log(`[seed] 平台管理员: ${PLATFORM_OPS_EMAIL} / ${PLATFORM_OPS_PASSWORD}`);
}

async function ensureMvpDevData() {
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  await prisma.organization.upsert({
    where: { id: MVP_ORGANIZATION_ID },
    create: {
      id: MVP_ORGANIZATION_ID,
      type: 'CUSTOMER',
      name: 'MVP 开发企业',
      planId: 'trial',
      planName: 'trial',
      monthlyArticleQuota: 100,
      subscriptionStatus: 'TRIAL',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    },
    update: {
      type: 'CUSTOMER',
      planName: 'trial',
      monthlyArticleQuota: 100,
    },
  });

  await prisma.user.upsert({
    where: { email: DEV_USER_EMAIL },
    create: {
      id: MVP_USER_ID,
      email: DEV_USER_EMAIL,
      name: '开发企业管理员',
      passwordHash: hashPassword(DEV_USER_PASSWORD),
      organizationId: MVP_ORGANIZATION_ID,
      role: 'ADMIN',
    },
    update: {
      name: '开发企业管理员',
      passwordHash: hashPassword(DEV_USER_PASSWORD),
      organizationId: MVP_ORGANIZATION_ID,
      role: 'ADMIN',
    },
  });

  await prisma.user.upsert({
    where: { email: DEV_MEMBER_EMAIL },
    create: {
      id: MVP_MEMBER_USER_ID,
      email: DEV_MEMBER_EMAIL,
      name: '开发成员',
      passwordHash: hashPassword(DEV_MEMBER_PASSWORD),
      organizationId: MVP_ORGANIZATION_ID,
      role: 'MEMBER',
    },
    update: {
      name: '开发成员',
      passwordHash: hashPassword(DEV_MEMBER_PASSWORD),
      organizationId: MVP_ORGANIZATION_ID,
      role: 'MEMBER',
    },
  });

  await prisma.user.upsert({
    where: { email: DEV_OUTSIDER_EMAIL },
    create: {
      id: MVP_OUTSIDER_USER_ID,
      email: DEV_OUTSIDER_EMAIL,
      name: '未加入项目成员',
      passwordHash: hashPassword(DEV_OUTSIDER_PASSWORD),
      organizationId: MVP_ORGANIZATION_ID,
      role: 'MEMBER',
    },
    update: {
      name: '未加入项目成员',
      passwordHash: hashPassword(DEV_OUTSIDER_PASSWORD),
      organizationId: MVP_ORGANIZATION_ID,
      role: 'MEMBER',
    },
  });

  await prisma.projectMember.deleteMany({
    where: { projectId: MVP_PROJECT_ID, userId: MVP_OUTSIDER_USER_ID },
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

  await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId: MVP_PROJECT_ID, userId: MVP_USER_ID } },
    create: {
      projectId: MVP_PROJECT_ID,
      userId: MVP_USER_ID,
      role: 'OWNER',
      grantedById: MVP_USER_ID,
    },
    update: { role: 'OWNER' },
  });

  await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId: MVP_PROJECT_ID, userId: MVP_MEMBER_USER_ID } },
    create: {
      projectId: MVP_PROJECT_ID,
      userId: MVP_MEMBER_USER_ID,
      role: 'EDITOR',
      grantedById: MVP_USER_ID,
    },
    update: { role: 'EDITOR' },
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
    if (process.env.REDIS_URL) {
      const redis = new Redis(process.env.REDIS_URL);
      await redis.del(`prompt:template:${version}`);
      await redis.quit();
    }
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

await ensureCatalogs();
await ensurePlatformSuperAdmin();
await ensurePlatformOperator();
await ensureMvpDevData();
await ensurePromptTemplates();
await ensurePromptBindings();

const jobCount = await prisma.articleJob.count({
  where: { projectId: MVP_PROJECT_ID },
});

console.log('[seed] 开发数据已就绪');
console.log(`  登录账号: ${DEV_USER_EMAIL}`);
console.log(`  成员账号: ${DEV_MEMBER_EMAIL} / ${DEV_MEMBER_PASSWORD}`);
console.log(`  超管账号: ${SUPER_USER_EMAIL} / ${SUPER_USER_PASSWORD}`);
console.log(`  平台管理员: ${PLATFORM_OPS_EMAIL} / ${PLATFORM_OPS_PASSWORD}`);
console.log(`  项目 ID: ${MVP_PROJECT_ID}`);
console.log(`  站点 ID: ${MVP_SITE_ID}`);
console.log(`  当前项目下 ArticleJob 数量: ${jobCount}`);
console.log('  提示：db:seed 默认不删文章；仅 RESET_DEV_DATA=true 时清空');

await prisma.$disconnect();
