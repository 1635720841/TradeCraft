import { http } from "@/utils/http";

export type UserResult = {
  success: boolean;
  data: {
    /** 头像 */
    avatar: string;
    /** 用户名 */
    username: string;
    /** 昵称 */
    nickname: string;
    /** 当前登录用户的角色 */
    roles: Array<string>;
    /** 按钮级别权限 */
    permissions: Array<string>;
    /** `token` */
    accessToken: string;
    /** 用于调用刷新`accessToken`的接口时所需的`token` */
    refreshToken: string;
    /** `accessToken`的过期时间（格式'xxxx/xx/xx xx:xx:xx'） */
    expires: Date;
  };
};

export type RefreshTokenResult = {
  success: boolean;
  data: {
    /** `token` */
    accessToken: string;
    /** 用于调用刷新`accessToken`的接口时所需的`token` */
    refreshToken: string;
    /** `accessToken`的过期时间（格式'xxxx/xx/xx xx:xx:xx'） */
    expires: Date;
  };
};

/** 登录 */
export const getLogin = (data?: object) => {
  return http.request<UserResult>("post", "/api/v1/auth/login", { data });
};

/** 刷新`token` */
export const refreshTokenApi = (data?: object) => {
  return http.request<RefreshTokenResult>("post", "/api/v1/auth/refresh-token", { data });
};

export interface AuthAccessMeta {
  permissionCatalog: Array<{
    id: string;
    name: string;
    module: string;
    description?: string;
    sortOrder: number;
  }>;
  roleDefaultPermissions: Record<string, string[]>;
  permissionImplies: Record<string, string[]>;
}

export interface AuthProfile {
  id: string;
  email: string;
  name: string | null;
  organizationId: string;
  organizationType: "CUSTOMER" | "PLATFORM";
  role: string;
  permissions: string[];
  grants: string[];
  visibleMenuKeys: string[];
  accessMeta?: AuthAccessMeta;
}

export type AuthProfileResult = {
  data: AuthProfile;
  meta?: { traceId?: string };
};

/** 当前登录用户 */
export const getAuthProfile = () => {
  return http.request<AuthProfileResult>("get", "/api/v1/auth/me");
};

export type LogtoConfigResult = {
  success: boolean;
  data: {
    enabled: boolean;
    endpoint: string | null;
    appId: string | null;
    redirectUri: string | null;
    authorizeUrl: string | null;
  };
};

/** Logto 登录配置（公开） */
export const getLogtoConfig = () => {
  return http.request<LogtoConfigResult>("get", "/api/v1/auth/logto/config");
};

/** Logto 授权码换平台会话 */
export const logtoCallback = (data: {
  code: string;
  redirectUri: string;
  inviteToken?: string;
}) => {
  return http.request<UserResult>("post", "/api/v1/auth/logto/callback", { data });
};
