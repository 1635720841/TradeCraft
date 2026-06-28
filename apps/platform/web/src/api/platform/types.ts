/**
 * MW 平台 API 响应格式（NestJS GlobalExceptionFilter 对齐）。
 */
export interface WmPaginationMeta {
  page: number;
  limit: number;
  total: number;
}

export interface WmApiResponse<T> {
  data: T;
  meta?: {
    traceId?: string;
    pagination?: WmPaginationMeta;
  };
}

export interface WmApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    traceId?: string;
  };
}
