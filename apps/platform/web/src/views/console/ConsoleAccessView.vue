<!--
  平台权限页：超管为平台运营账号授予 Console 权限；租户菜单覆盖为高级能力。
-->
<template>
  <div class="p-4 space-y-4">
    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="本页不管理租户成员。平台运营账号在此配置 Console 权限；租户成员的增删与授权请在「企业管理 → 成员与权限」完成。"
      class="mb-4"
    />

    <ConsoleUserListPanel
      :loading="loadingUsers"
      :users="users"
      :page="page"
      :limit="limit"
      :total="total"
      :scope="userScope"
      v-model:keyword="keyword"
      @update:scope="onScopeChange"
      @search="searchUsers"
      @select="onSelectUser"
      @page-change="(p) => { page = p; fetchUsers(); }"
    />

    <el-card v-if="selectedUser?.role === 'SUPER_ADMIN'" shadow="never">
      <el-alert type="warning" :closable="false" show-icon title="超级管理员拥有全部权限，不可在此配置。" />
    </el-card>

    <el-card v-else-if="selectedUser" shadow="never">
      <el-tabs v-model="configTab">
        <el-tab-pane
          v-if="selectedUser.role === 'PLATFORM_OPERATOR'"
          label="Console 权限"
          name="platform"
        >
          <ConsolePermissionGrantPanel
            :loading="loadingPerms"
            :saving="savingPerms"
            :user-email="selectedUser.email"
            :default-perm-hint="defaultPermHint"
            :effective-permissions="effectivePermissions"
            :permission-name-map="permissionNameMap"
            :sections="consolePermissionSections"
            :selected-grant-ids="selectedGrantIds"
            :is-default-permission="isDefaultPermission"
            @select-all="selectAllPlatformPerms"
            @clear-grants="clearExtraGrants"
            @save="savePermissions"
            @grant-change="onGrantChange"
          />
        </el-tab-pane>

        <el-tab-pane
          v-if="selectedUser.role !== 'PLATFORM_OPERATOR'"
          label="侧栏菜单覆盖（高级）"
          name="menu"
        >
          <ConsoleMenuOverridePanel
            :loading="loadingMenus"
            :saving="savingMenus"
            :menu-config="menuConfig"
            v-model:enabled-menu-ids="enabledMenuIds"
            @save="saveMenus"
          />
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import {
  getConsoleUserPermissions,
  getUserMenus,
  listConsolePermissions,
  listConsoleUsers,
  setConsoleUserPermissions,
  setUserMenus,
  type ConsoleUserItem,
  type PermissionDefinition,
  type UserMenuConfig
} from "@/api/console/index";
import {
  CONSOLE_PERMISSION_SECTIONS,
  PLATFORM_GRANTABLE_PERMISSION_IDS
} from "@/constants/platform-access";
import { useUserStoreHook } from "@/store/modules/user";
import { usePermissionGrantExpand } from "@/composables/usePermissionGrantExpand";
import { message } from "@/utils/message";
import ConsoleMenuOverridePanel from "./components/ConsoleMenuOverridePanel.vue";
import ConsolePermissionGrantPanel from "./components/ConsolePermissionGrantPanel.vue";
import ConsoleUserListPanel from "./components/ConsoleUserListPanel.vue";

defineOptions({ name: "ConsoleAccessView" });

const userStore = useUserStoreHook();
const { expandGrantIds } = usePermissionGrantExpand();

const loadingUsers = ref(false);
const loadingMenus = ref(false);
const loadingPerms = ref(false);
const savingMenus = ref(false);
const savingPerms = ref(false);
const users = ref<ConsoleUserItem[]>([]);
const page = ref(1);
const limit = ref(50);
const total = ref(0);
const keyword = ref("");
const userScope = ref<"platform" | "tenant">("platform");
const selectedUser = ref<ConsoleUserItem | null>(null);
const configTab = ref("platform");
const menuConfig = ref<UserMenuConfig | null>(null);
const enabledMenuIds = ref<string[]>([]);
const catalog = ref<PermissionDefinition[]>([]);
const selectedGrantIds = ref<string[]>([]);
const effectivePermissions = ref<string[]>([]);

const roleDefaultPermissions = computed(
  () => userStore.accessMeta?.roleDefaultPermissions ?? {}
);

const permissionNameMap = computed(() =>
  Object.fromEntries(catalog.value.map((p) => [p.id, p.name]))
);

const consoleCatalog = computed(() =>
  catalog.value.filter(
    (item) =>
      item.id.startsWith("console:") && PLATFORM_GRANTABLE_PERMISSION_IDS.includes(item.id)
  )
);

const consolePermissionSections = computed(() =>
  CONSOLE_PERMISSION_SECTIONS.map((section) => ({
    ...section,
    items: consoleCatalog.value
      .filter((item) => section.match(item.id))
      .sort((a, b) => a.sortOrder - b.sortOrder)
  })).filter((section) => section.items.length > 0)
);

const defaultPermHint = computed(() => {
  if (!selectedUser.value) return "-";
  const defaults = roleDefaultPermissions.value[selectedUser.value.role] ?? [];
  return defaults.length ? `${defaults.length} 项` : "无";
});

function isDefaultPermission(permId: string) {
  if (!selectedUser.value) return false;
  const defaults = roleDefaultPermissions.value[selectedUser.value.role] ?? [];
  return defaults.includes(permId);
}

function onGrantChange(ids: string[]) {
  selectedGrantIds.value = expandGrantIds(ids);
}

function selectAllPlatformPerms() {
  selectedGrantIds.value = expandGrantIds([...PLATFORM_GRANTABLE_PERMISSION_IDS]);
}

function clearExtraGrants() {
  selectedGrantIds.value = [];
}

async function fetchUsers() {
  loadingUsers.value = true;
  try {
    const result = await listConsoleUsers(
      page.value,
      limit.value,
      keyword.value.trim(),
      userScope.value
    );
    users.value = result.items;
    total.value = result.pagination.total;
  } finally {
    loadingUsers.value = false;
  }
}

function searchUsers() {
  page.value = 1;
  void fetchUsers();
}

function onScopeChange(scope: "platform" | "tenant") {
  userScope.value = scope;
  page.value = 1;
  selectedUser.value = null;
  menuConfig.value = null;
  void fetchUsers();
}

async function loadPlatformPermissions(user: ConsoleUserItem) {
  loadingPerms.value = true;
  menuConfig.value = null;
  try {
    const result = await getConsoleUserPermissions(user.id);
    selectedGrantIds.value = [...result.grants];
    effectivePermissions.value = result.effectivePermissions;
  } finally {
    loadingPerms.value = false;
  }
}

async function loadMenuOverride(user: ConsoleUserItem) {
  loadingMenus.value = true;
  selectedGrantIds.value = [];
  effectivePermissions.value = [];
  try {
    const config = await getUserMenus(user.id);
    menuConfig.value = config;
    enabledMenuIds.value = config.menus.filter((m) => m.enabled).map((m) => m.id);
  } finally {
    loadingMenus.value = false;
  }
}

async function onSelectUser(user: ConsoleUserItem | undefined) {
  selectedUser.value = user ?? null;
  menuConfig.value = null;
  if (!user) return;
  if (user.role === "SUPER_ADMIN") return;
  if (user.role === "PLATFORM_OPERATOR") {
    configTab.value = "platform";
    await loadPlatformPermissions(user);
    return;
  }
  configTab.value = "menu";
  await loadMenuOverride(user);
}

async function saveMenus() {
  if (!selectedUser.value) return;
  savingMenus.value = true;
  try {
    const config = await setUserMenus(selectedUser.value.id, enabledMenuIds.value);
    menuConfig.value = config;
    enabledMenuIds.value = config.menus.filter((m) => m.enabled).map((m) => m.id);
    message("菜单覆盖已保存", { type: "success" });
  } finally {
    savingMenus.value = false;
  }
}

async function savePermissions() {
  if (!selectedUser.value) return;
  savingPerms.value = true;
  try {
    const result = await setConsoleUserPermissions(
      selectedUser.value.id,
      selectedGrantIds.value
    );
    selectedGrantIds.value = [...result.grants];
    effectivePermissions.value = result.effectivePermissions;
    message("平台权限已保存", { type: "success" });
  } finally {
    savingPerms.value = false;
  }
}

watch(userScope, () => {
  selectedUser.value = null;
});

onMounted(async () => {
  await userStore.ensureAuthProfile();
  void fetchUsers();
  void listConsolePermissions().then((items) => {
    catalog.value = items;
  });
});
</script>
