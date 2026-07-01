import type {
  Method,
  AxiosError,
  AxiosResponse,
  AxiosRequestConfig
} from "axios";

export type resultType = {
  accessToken?: string;
};

export type RequestMethods = Extract<
  Method,
  "get" | "post" | "put" | "delete" | "patch" | "option" | "head"
>;

export interface PureHttpError extends AxiosError {
  isCancelRequest?: boolean;
}

export interface PureHttpResponse extends AxiosResponse {
  config: PureHttpRequestConfig;
}

export interface PureHttpRequestConfig extends AxiosRequestConfig {
  beforeRequestCallback?: (request: PureHttpRequestConfig) => void;
  beforeResponseCallback?: (response: PureHttpResponse) => void;
  /** 为 true 时由调用方自行展示错误，全局拦截器不弹 toast */
  skipGlobalErrorToast?: boolean;
}

/** 业务 API 请求配置（合并 axios 与 PureHttp 扩展字段） */
export type HttpRequestConfig = AxiosRequestConfig & Pick<PureHttpRequestConfig, 'skipGlobalErrorToast'>;

export default class PureHttp {
  request<T>(
    method: RequestMethods,
    url: string,
    param?: HttpRequestConfig,
    axiosConfig?: PureHttpRequestConfig
  ): Promise<T>;
  post<T, P>(
    url: string,
    params?: HttpRequestConfig,
    config?: PureHttpRequestConfig
  ): Promise<T>;
  get<T, P>(
    url: string,
    params?: HttpRequestConfig,
    config?: PureHttpRequestConfig
  ): Promise<T>;
}
