<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { ChevronDown, LayoutGrid, Settings } from "@lucide/vue";
import { useI18n } from "vue-i18n";
import LaySearch from "../lay-search/index.vue";
import LayNotice from "../lay-notice/index.vue";
import { useNav } from "@/layout/hooks/useNav";
import { useUserStoreHook } from "@/store/modules/user";
import { getOrganizationProfile } from "@/api/org/organization";
import { memberRoleDict } from "@/constants/dicts/platform";
import { dictLabel } from "@/utils/dict";
import LogoutCircleRLine from "~icons/ri/logout-circle-r-line";

const { t } = useI18n();
const router = useRouter();
const { logout, onPanel, username, userAvatar } = useNav();
const userStore = useUserStoreHook();

const orgName = ref("我的企业");

const isPlatformOperator = computed(() =>
  userStore.roles.includes("platform_operator")
);

const roleLabel = computed(() => {
  if (userStore.roles.includes("super_admin")) {
    return dictLabel(memberRoleDict, "SUPER_ADMIN");
  }
  if (userStore.roles.includes("platform_operator")) {
    return dictLabel(memberRoleDict, "PLATFORM_OPERATOR");
  }
  if (userStore.roles.includes("admin")) {
    return dictLabel(memberRoleDict, "ADMIN");
  }
  return dictLabel(memberRoleDict, "MEMBER");
});

onMounted(async () => {
  if (isPlatformOperator.value) return;
  try {
    const profile = await getOrganizationProfile();
    orgName.value = profile.name || "我的企业";
  } catch {
    /* 顶栏展示降级为默认文案 */
  }
});

function goOrganization() {
  router.push("/org/profile");
}
</script>

<template>
  <div class="shell-topbar-right">
    <LaySearch id="header-search" />
    <LayNotice id="header-notice" />
    <button
      v-if="!isPlatformOperator"
      type="button"
      class="shell-topbar-action shell-topbar-workspace"
      @click="goOrganization"
    >
      <LayoutGrid :size="16" :stroke-width="1.75" aria-hidden="true" />
      <span class="shell-topbar-workspace__name">{{ orgName }}</span>
      <ChevronDown :size="14" :stroke-width="2" aria-hidden="true" />
    </button>
    <el-dropdown trigger="click">
      <button type="button" class="shell-topbar-profile">
        <img :src="userAvatar" alt="" class="shell-topbar-profile__avatar" />
        <span class="shell-topbar-profile__text">
          <span class="shell-topbar-profile__name">{{ username }}</span>
          <span class="shell-topbar-profile__role">{{ roleLabel }}</span>
        </span>
      </button>
      <template #dropdown>
        <el-dropdown-menu class="shell-topbar-logout">
          <el-dropdown-item @click="logout">
            <IconifyIconOffline
              :icon="LogoutCircleRLine"
              style="margin: 5px"
            />
            {{ t("buttons.pureLoginOut") }}
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
    <button
      type="button"
      class="shell-topbar-action shell-topbar-settings"
      :title="t('buttons.pureOpenSystemSet')"
      @click="onPanel"
    >
      <Settings :size="18" :stroke-width="1.75" aria-hidden="true" />
    </button>
  </div>
</template>

<style lang="scss" scoped>
.shell-topbar-logout {
  width: 120px;

  ::v-deep(.el-dropdown-menu__item) {
    display: inline-flex;
    flex-wrap: wrap;
    min-width: 100%;
  }
}
</style>
