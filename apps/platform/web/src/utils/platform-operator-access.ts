import { storageLocal } from "@pureadmin/utils";
import { userKey } from "@/utils/auth";

type StoredUser = { roles?: string[] };

export function isPlatformOperatorUser(): boolean {
  const userInfo = storageLocal().getItem(userKey) as StoredUser | null;
  const roles = userInfo?.roles ?? [];
  return roles.includes("super_admin") || roles.includes("platform_operator");
}
