/**
 * 企业/平台权限勾选：按 accessMeta.permissionImplies 展开 grant。
 */

import { computed } from "vue";
import { useUserStoreHook } from "@/store/modules/user";
import { expandPermissionGrantIds } from "@/utils/permission-grants";

export function usePermissionGrantExpand() {
  const userStore = useUserStoreHook();

  const permissionImplies = computed(
    () => userStore.accessMeta?.permissionImplies ?? {}
  );

  function expandGrantIds(ids: string[]) {
    return expandPermissionGrantIds(ids, permissionImplies.value);
  }

  return { permissionImplies, expandGrantIds };
}
