/**
 * 当前用户在某 SEO 项目内的成员权限（与路由 meta.seoPermission 同源）。
 * 工作台 Shell provide 后，子页面/侧栏 inject 复用，避免重复请求。
 */

import {
  computed,
  inject,
  provide,
  ref,
  watch,
  type ComputedRef,
  type InjectionKey,
  type MaybeRefOrGetter,
  type Ref,
  toValue
} from "vue";
import {
  fetchProjectAccess,
  hasProjectSeoPermission
} from "@/router/guards/project-access";
import { canPublishSeoJob, canReviewSeoJob } from "@/utils/project-seo-permission";
import { useUserStoreHook } from "@/store/modules/user";

export interface ProjectSeoAccessContext {
  permissions: Ref<string[]>;
  canEnter: Ref<boolean>;
  loading: Ref<boolean>;
  can: (required: string | string[] | undefined) => boolean;
  canReview: () => boolean;
  canPublish: () => boolean;
  refresh: () => Promise<void>;
  isSuperAdmin: ComputedRef<boolean>;
}

export const PROJECT_SEO_ACCESS_KEY: InjectionKey<ProjectSeoAccessContext> =
  Symbol("projectSeoAccess");

function createProjectSeoAccess(
  projectId: MaybeRefOrGetter<string>
): ProjectSeoAccessContext {
  const userStore = useUserStoreHook();
  const permissions = ref<string[]>([]);
  const canEnter = ref(false);
  const loading = ref(false);

  const isSuperAdmin = computed(() => userStore.roles.includes("super_admin"));

  async function refresh() {
    const id = toValue(projectId);
    if (!id) {
      permissions.value = [];
      canEnter.value = false;
      return;
    }
    loading.value = true;
    try {
      const access = await fetchProjectAccess(id);
      canEnter.value = access.canEnter;
      permissions.value = access.permissions;
    } catch {
      permissions.value = [];
      canEnter.value = false;
    } finally {
      loading.value = false;
    }
  }

  function can(required: string | string[] | undefined) {
    return hasProjectSeoPermission(permissions.value, required, {
      superAdmin: isSuperAdmin.value
    });
  }

  function canReview() {
    return canReviewSeoJob(permissions.value, { superAdmin: isSuperAdmin.value });
  }

  function canPublish() {
    return canPublishSeoJob(permissions.value, { superAdmin: isSuperAdmin.value });
  }

  watch(() => toValue(projectId), () => void refresh(), { immediate: true });

  return { permissions, canEnter, loading, can, canReview, canPublish, refresh, isSuperAdmin };
}

/** 在工作台 Shell 调用，向子树提供项目权限上下文 */
export function provideProjectSeoAccess(
  projectId: MaybeRefOrGetter<string>
): ProjectSeoAccessContext {
  const ctx = createProjectSeoAccess(projectId);
  provide(PROJECT_SEO_ACCESS_KEY, ctx);
  return ctx;
}

/**
 * 读取项目成员权限。工作台内优先 inject；独立调用需传 projectId。
 */
export function useProjectSeoAccess(
  projectId?: MaybeRefOrGetter<string>
): ProjectSeoAccessContext {
  const injected = inject(PROJECT_SEO_ACCESS_KEY, null);
  if (injected) {
    return injected;
  }
  if (projectId === undefined) {
    throw new Error(
      "useProjectSeoAccess: 工作台外使用须传入 projectId"
    );
  }
  return createProjectSeoAccess(projectId);
}
