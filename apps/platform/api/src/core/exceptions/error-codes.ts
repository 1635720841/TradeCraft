/**
 * 全局错误码注册表：前后端统一引用。
 *
 * 边界：
 * - 不负责：异常抛出逻辑（由 BusinessException 处理）
 */

export const ErrorCodes = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  PROJECT_ARCHIVED: 'PROJECT_ARCHIVED',
  JOB_NOT_FOUND: 'JOB_NOT_FOUND',
  PROMPT_NOT_FOUND: 'PROMPT_NOT_FOUND',
  SITE_NOT_FOUND: 'SITE_NOT_FOUND',
  EXTERNAL_API_ERROR: 'EXTERNAL_API_ERROR',
  LLM_PARSE_ERROR: 'LLM_PARSE_ERROR',
  UNKNOWN: 'UNKNOWN',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
