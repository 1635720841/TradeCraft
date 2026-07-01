/**
 * Web API 通用响应类型。
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
