import { defineStore } from "pinia";
import {
  type userType,
  store,
  router,
  resetRouter,
  routerArrays,
  storageLocal
} from "../utils";
import {
  type AuthSession,
  type UserResult,
  type RefreshTokenResult,
  type AuthAccessMeta,
  getAuthProfile,
  getLogin,
  hasAuthSession,
  refreshTokenApi
} from "@/api/user";
import { useMultiTagsStoreHook } from "./multiTags";
import { usePermissionStoreHook } from "./permission";
import { type DataInfo, setToken, removeToken, userKey } from "@/utils/auth";

function mapApiRole(role: string): string {
  if (role === "SUPER_ADMIN") return "super_admin";
  if (role === "PLATFORM_OPERATOR") return "platform_operator";
  if (role === "ADMIN") return "admin";
  if (role === "MEMBER") return "common";
  return role.toLowerCase();
}

function normalizePermissions(permissions: string[]): string[] {
  if (permissions.includes("*:*:*")) return ["*:*:*"];
  return permissions;
}

export const useUserStore = defineStore("pure-user", {
  state: (): userType => ({
    // 头像
    avatar: storageLocal().getItem<DataInfo<number>>(userKey)?.avatar ?? "",
    // 用户名
    username: storageLocal().getItem<DataInfo<number>>(userKey)?.username ?? "",
    // 昵称
    nickname: storageLocal().getItem<DataInfo<number>>(userKey)?.nickname ?? "",
    // 页面级别权限
    roles: storageLocal().getItem<DataInfo<number>>(userKey)?.roles ?? [],
    // 按钮级别权限
    permissions:
      storageLocal().getItem<DataInfo<number>>(userKey)?.permissions ?? [],
    visibleMenuKeys:
      storageLocal().getItem<DataInfo<number>>(userKey)?.visibleMenuKeys ?? [],
    accessMeta:
      storageLocal().getItem<DataInfo<number>>(userKey)?.accessMeta ?? null,
    // 是否勾选了登录页的免登录
    isRemembered: false,
    // 登录页的免登录存储几天，默认7天
    loginDay: 7
  }),
  actions: {
    /** 存储头像 */
    SET_AVATAR(avatar: string) {
      this.avatar = avatar;
    },
    /** 存储用户名 */
    SET_USERNAME(username: string) {
      this.username = username;
    },
    /** 存储昵称 */
    SET_NICKNAME(nickname: string) {
      this.nickname = nickname;
    },
    /** 存储角色 */
    SET_ROLES(roles: Array<string>) {
      this.roles = roles;
    },
    /** 存储按钮级别权限 */
    SET_PERMS(permissions: Array<string>) {
      this.permissions = permissions;
    },
    /** 存储可见菜单 key */
    SET_VISIBLE_MENU_KEYS(keys: Array<string>) {
      this.visibleMenuKeys = keys;
    },
    /** 存储访问元数据（权限目录等） */
    SET_ACCESS_META(meta: AuthAccessMeta | null) {
      this.accessMeta = meta;
    },
    /** 合并 accessMeta 并写入 localStorage（旧会话补全用） */
    patchAccessMeta(partial: Partial<AuthAccessMeta>) {
      const next: AuthAccessMeta = {
        permissionCatalog:
          partial.permissionCatalog ?? this.accessMeta?.permissionCatalog ?? [],
        roleDefaultPermissions:
          partial.roleDefaultPermissions ??
          this.accessMeta?.roleDefaultPermissions ??
          {},
        permissionImplies:
          partial.permissionImplies ?? this.accessMeta?.permissionImplies ?? {}
      };
      this.SET_ACCESS_META(next);
      const cached = storageLocal().getItem<DataInfo<number>>(userKey) ?? {};
      storageLocal().setItem(userKey, { ...cached, accessMeta: next });
    },
    /** 存储是否勾选了登录页的免登录 */
    SET_ISREMEMBERED(bool: boolean) {
      this.isRemembered = bool;
    },
    /** 设置登录页的免登录存储几天 */
    SET_LOGINDAY(value: number) {
      this.loginDay = Number(value);
    },
    /** 登入 */
    async loginByUsername(data) {
      return new Promise<UserResult>((resolve, reject) => {
        getLogin(data)
          .then(async data => {
            if (hasAuthSession(data)) {
              setToken(data.data);
              await this.syncAuthProfile();
            }
            resolve(data);
          })
          .catch(error => {
            reject(error);
          });
      });
    },
    /** Logto / 外部 Auth 回调后写入会话 */
    async applySession(session: AuthSession) {
      setToken(session);
      await this.syncAuthProfile();
    },
    /** 从后端同步当前用户信息（/api/v1/auth/me） */
    async syncAuthProfile() {
      try {
        const res = await getAuthProfile();
        const profile = res.data;
        if (!profile) return;

        const role = mapApiRole(profile.role);
        const permissions = normalizePermissions(profile.permissions ?? []);
        const visibleMenuKeys = profile.visibleMenuKeys ?? [];

        this.SET_USERNAME(profile.email);
        this.SET_NICKNAME(profile.name ?? profile.email);
        this.SET_ROLES([role]);
        this.SET_PERMS(permissions);
        this.SET_VISIBLE_MENU_KEYS(visibleMenuKeys);
        this.SET_ACCESS_META(profile.accessMeta ?? null);

        const cached = storageLocal().getItem<DataInfo<number>>(userKey) ?? {};
        storageLocal().setItem(userKey, {
          ...cached,
          username: profile.email,
          nickname: profile.name ?? profile.email,
          roles: [role],
          permissions,
          visibleMenuKeys,
          accessMeta: profile.accessMeta ?? null
        });

        usePermissionStoreHook().handleWholeMenus([]);
      } catch {
        // 未登录或 token 失效时由 HTTP 拦截器处理
      }
    },
    /** 旧会话缺少 accessMeta 时从 /auth/me 补全 */
    async ensureAuthProfile() {
      const meta = this.accessMeta;
      const hasRoleDefaults =
        meta?.roleDefaultPermissions &&
        Object.keys(meta.roleDefaultPermissions).length > 0;
      if (hasRoleDefaults) return;
      await this.syncAuthProfile();
    },
    /** 前端登出（不调用接口） */
    logOut() {
      this.username = "";
      this.roles = [];
      this.permissions = [];
      this.visibleMenuKeys = [];
      this.accessMeta = null;
      removeToken();
      useMultiTagsStoreHook().handleTags("equal", [...routerArrays]);
      resetRouter();
      router.push("/login");
    },
    /** 刷新`token` */
    async handRefreshToken(data) {
      return new Promise<RefreshTokenResult>((resolve, reject) => {
        refreshTokenApi(data)
          .then(data => {
            if (data?.data?.accessToken) {
              setToken(data.data);
              resolve(data);
              return;
            }
            reject(new Error("刷新令牌失败"));
          })
          .catch(error => {
            reject(error);
          });
      });
    }
  }
});

export function useUserStoreHook() {
  return useUserStore(store);
}
