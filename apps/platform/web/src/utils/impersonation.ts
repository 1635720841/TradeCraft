/**
 * Console 代登录：保存原 token，切换为 impersonation JWT，退出时恢复。
 */

import Cookies from "js-cookie";
import { useUserStoreHook } from "@/store/modules/user";
import { getToken, setToken, TokenKey, userKey } from "@/utils/auth";
import { storageLocal } from "@pureadmin/utils";

const ORIGINAL_TOKEN_KEY = "wm:impersonation-original";
const TARGET_EMAIL_KEY = "wm:impersonation-target-email";

export function isImpersonating(): boolean {
  return sessionStorage.getItem(ORIGINAL_TOKEN_KEY) != null;
}

export function impersonationTargetEmail(): string | null {
  return sessionStorage.getItem(TARGET_EMAIL_KEY);
}

export async function startImpersonation(
  accessToken: string,
  expiresIso: string,
  targetEmail: string
): Promise<void> {
  const current = getToken();
  sessionStorage.setItem(ORIGINAL_TOKEN_KEY, JSON.stringify(current));
  sessionStorage.setItem(TARGET_EMAIL_KEY, targetEmail);
  setToken({
    accessToken,
    expires: new Date(expiresIso),
    refreshToken: current.refreshToken
  });
  await useUserStoreHook().syncAuthProfile();
}

export async function endImpersonation(): Promise<void> {
  const raw = sessionStorage.getItem(ORIGINAL_TOKEN_KEY);
  if (!raw) return;

  const original = JSON.parse(raw) as {
    accessToken: string;
    expires: number;
    refreshToken: string;
  };
  sessionStorage.removeItem(ORIGINAL_TOKEN_KEY);
  sessionStorage.removeItem(TARGET_EMAIL_KEY);

  const cookieString = JSON.stringify({
    accessToken: original.accessToken,
    expires: original.expires,
    refreshToken: original.refreshToken
  });
  Cookies.set(TokenKey, cookieString);

  const cached = storageLocal().getItem(userKey);
  if (cached) {
    storageLocal().setItem(userKey, cached);
  }

  await useUserStoreHook().syncAuthProfile();
}
