/**
 * 企业管理员首次配置 Checklist：创建项目 → 开放 → 加入成员 → 进入工作台。
 */

import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { listOrgProjects, type OrgProjectItem } from "@/api/org/projects";
import { useUserStoreHook } from "@/store/modules/user";
import type { SetupChecklistItem } from "@/types/setup-checklist";

const SNOOZE_KEY = "wm:org-admin-setup-snooze-until";
const SNOOZE_DAYS = 7;

function isSnoozed(): boolean {
  const until = localStorage.getItem(SNOOZE_KEY);
  if (!until) return false;
  return Date.now() < Number(until);
}

export function useOrgAdminSetupChecklist() {
  const router = useRouter();
  const userStore = useUserStoreHook();
  const loading = ref(false);
  const projects = ref<OrgProjectItem[]>([]);
  const dismissed = ref(isSnoozed());

  const isOrgAdmin = computed(() => userStore.roles.includes("admin"));

  const firstProject = computed(() => projects.value[0]);

  async function refresh() {
    if (!isOrgAdmin.value) {
      projects.value = [];
      return;
    }
    loading.value = true;
    try {
      const result = await listOrgProjects(1, 100);
      projects.value = result.items;
    } catch {
      projects.value = [];
    } finally {
      loading.value = false;
    }
  }

  watch(isOrgAdmin, () => void refresh(), { immediate: true });

  const allDone = computed(() => {
    if (!isOrgAdmin.value || projects.value.length === 0) return false;
    return projects.value.some(p => p.canEnter === true);
  });

  const visible = computed(
    () => isOrgAdmin.value && !dismissed.value && !allDone.value
  );

  const items = computed<SetupChecklistItem[]>(() => {
    const list = projects.value;
    const target = list[0];
    const hasProject = list.length > 0;
    const hasOpenProject = list.some(p => p.accessActive);
    const selfJoined = list.some(p => p.isMember);
    const canEnterAny = list.some(p => p.canEnter);

    return [
      {
        id: "create",
        label: "创建至少一个内容生产项目",
        done: hasProject,
        actionLabel: "去创建",
        onAction: () => router.push("/org/projects")
      },
      {
        id: "open",
        label: "设置项目开放时间（或设为长期开放）",
        done: hasOpenProject,
        actionLabel: "去设置",
        onAction: () =>
          target
            ? router.push({ path: "/org/projects", query: { openManage: target.id } })
            : router.push("/org/projects")
      },
      {
        id: "member",
        label: "将自己加入项目成员（企业管理员不会自动获得进入权限）",
        done: selfJoined,
        actionLabel: "去加入",
        onAction: () =>
          target
            ? router.push({ path: "/org/projects", query: { openManage: target.id } })
            : router.push("/org/projects")
      },
      {
        id: "enter",
        label: "授予 SEO 权限并进入工作台",
        done: canEnterAny,
        actionLabel: "去授权",
        onAction: () => {
          const p = list.find(x => x.canEnter) ?? list.find(x => x.isMember) ?? list[0];
          if (p?.canEnter) {
            router.push(`/projects/${p.id}/seo-factory/overview`);
          } else if (p) {
            router.push({
              path: "/org/projects",
              query: { openPerm: p.id, preset: "content_editor" }
            });
          } else {
            router.push("/org/projects");
          }
        }
      }
    ];
  });

  const pendingCount = computed(
    () => items.value.filter((item) => !item.done).length
  );

  function dismiss() {
    dismissed.value = true;
    localStorage.setItem(
      SNOOZE_KEY,
      String(Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000)
    );
  }

  return { loading, visible, items, refresh, dismiss, allDone, firstProject, pendingCount };
}
