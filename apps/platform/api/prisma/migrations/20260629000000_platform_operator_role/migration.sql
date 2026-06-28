-- 平台运营角色：租户与审计，不含 Prompt / 访问控制
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'PLATFORM_OPERATOR';
