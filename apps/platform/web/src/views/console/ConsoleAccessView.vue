<!--
  访问控制页：超管为平台管理员账号授予权限；为租户成员覆盖侧栏菜单。
-->
<template>
  <div class="p-4 space-y-4">
    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="平台管理员账号在此授予 console 权限；租户成员侧栏通常由角色与权限自动决定，菜单覆盖仅用于个别特例。"
      class="mb-4"
    />

    <el-card v-loading="loadingUsers" shadow="never">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="font-medium">选择用户</span>
          <div class="flex gap-2">
            <el-input
              v-model="keyword"
              placeholder="搜索邮箱或姓名"
              clearable
              class="w-52"
              @keyup.enter="searchUsers"
            />
            <el-button @click="searchUsers">搜索</el-button>
          </div>
        </div>
      </template>

      <el-table
        :data="users"
        highlight-current-row
        stripe
        @current-change="onSelectUser"
      >
        <el-table-column prop="email" label="邮箱" min-width="180" />
        <el-table-column prop="name" label="姓名" min-width="120">
          <template #default="{ row }">{{ row.name || "-" }}</template>
        </el-table-column>
        <el-table-column prop="role" label="角色" width="120">
          <template #default="{ row }">
            <el-tag :type="dictTagType(memberRoleDict, row.role)">
              {{ dictLabel(memberRoleDict, row.role) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="organizationName" label="所属企业" min-width="160" />
      </el-table>

      <div class="mt-4 flex justify-end">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="limit"
          :total="total"
          :page-sizes="[20, 50]"
          layout="total, prev, pager, next"
          @current-change="fetchUsers"
        />
      </div>
    </el-card>

    <el-card v-if="selectedUser?.role === 'SUPER_ADMIN'" shadow="never">
      <el-alert type="warning" :closable="false" show-icon title="超级管理员拥有全部权限，不可在此配置。" />
    </el-card>

    <el-card v-else-if="selectedUser" shadow="never">
      <el-tabs v-model="configTab">
        <el-tab-pane
          v-if="selectedUser.role === 'PLATFORM_OPERATOR'"
          label="平台账号权限"
          name="platform"
        >
          <div v-loading="loadingPerms">
            <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
              <span class="font-medium">{{ selectedUser.email }}</span>
              <div class="flex flex-wrap gap-2">
                <el-button @click="selectAllPlatformPerms">全选平台权限</el-button>
                <el-button @click="clearExtraGrants">清空额外授权</el-button>
                <el-button type="primary" :loading="savingPerms" @click="savePermissions">
                  保存权限
                </el-button>
              </div>
            </div>

            <el-alert
              class="mb-4"
              type="info"
              :closable="false"
              show-icon
              :title="`角色默认权限：${defaultPermHint}（灰色不可取消）`"
            />

            <el-alert
              v-if="effectivePermissions.length"
              class="mb-4"
              type="success"
              :closable="false"
              show-icon
            >
              <template #title>最终生效权限（{{ effectivePermissions.length }} 项）</template>
              <div class="mt-1 flex flex-wrap gap-1">
                <el-tag
                  v-for="permId in effectivePermissions"
                  :key="permId"
                  size="small"
                  type="info"
                >
                  {{ permissionNameMap[permId] ?? permId }}
                </el-tag>
              </div>
            </el-alert>

            <div
              v-for="section in consolePermissionSections"
              :key="section.key"
              class="mb-4 rounded-lg border border-gray-100 p-3"
            >
              <div class="mb-2 text-sm font-medium text-gray-600">{{ section.label }}</div>
              <el-checkbox-group :model-value="selectedGrantIds" @change="onGrantChange">
                <div class="grid grid-cols-1 gap-2">
                  <el-checkbox
                    v-for="perm in section.items"
                    :key="perm.id"
                    :value="perm.id"
                    :disabled="isDefaultPermission(perm.id)"
                  >
                    <span>{{ perm.name }}</span>
                    <span v-if="perm.description" class="ml-1 text-xs text-gray-400">
                      — {{ perm.description }}
                    </span>
                  </el-checkbox>
                </div>
              </el-checkbox-group>
            </div>
          </div>
        </el-tab-pane>

        <el-tab-pane
          v-if="selectedUser.role !== 'PLATFORM_OPERATOR'"
          label="菜单覆盖（高级）"
          name="menu"
        >
          <div v-loading="loadingMenus">
            <el-alert
              class="mb-4"
              type="warning"
              :closable="false"
              show-icon
              title="常规场景请通过「企业管理 → 成员与权限」控制访问；勿随意覆盖菜单，否则可能与实际权限不一致。"
            />

            <div v-if="menuConfig" class="flex flex-wrap items-center justify-between gap-2 mb-4">
              <span class="font-medium">{{ menuConfig.user.email }}</span>
              <el-button type="primary" :loading="savingMenus" @click="saveMenus">
                保存覆盖
              </el-button>
            </div>

            <el-checkbox-group v-if="menuConfig" v-model="enabledMenuIds">
              <div class="space-y-2">
                <el-checkbox v-for="menu in menuConfig.menus" :key="menu.id" :value="menu.id">
                  {{ menu.title }}
                  <span class="text-xs text-gray-400">（{{ menu.routePath }}）</span>
                </el-checkbox>
              </div>
            </el-checkbox-group>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
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
import { memberRoleDict } from "@/constants/dicts/platform";
import {
  CONSOLE_PERMISSION_SECTIONS,
  PLATFORM_GRANTABLE_PERMISSION_IDS
} from "@/constants/platform-access";
import { useUserStoreHook } from "@/store/modules/user";
import { usePermissionGrantExpand } from "@/composables/usePermissionGrantExpand";
import { dictLabel, dictTagType } from "@/utils/dict";
import { message } from "@/utils/message";

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
  Object.fromEntries(catalog.value.map(p => [p.id, p.name]))
);

const consoleCatalog = computed(() =>
  catalog.value.filter(
    item =>
      item.id.startsWith("console:") && PLATFORM_GRANTABLE_PERMISSION_IDS.includes(item.id)
  )
);

const consolePermissionSections = computed(() =>
  CONSOLE_PERMISSION_SECTIONS.map(section => ({
    ...section,
    items: consoleCatalog.value
      .filter(item => section.match(item.id))
      .sort((a, b) => a.sortOrder - b.sortOrder)
  })).filter(section => section.items.length > 0)
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
    const result = await listConsoleUsers(page.value, limit.value, keyword.value.trim());
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
    enabledMenuIds.value = config.menus.filter(m => m.enabled).map(m => m.id);
  } finally {
    loadingMenus.value = false;
  }
}

async function onSelectUser(user: ConsoleUserItem | undefined) {
  selectedUser.value = user ?? null;
  menuConfig.value = null;
  if (!user) return;

  if (user.role === "SUPER_ADMIN") {
    return;
  }

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
    enabledMenuIds.value = config.menus.filter(m => m.enabled).map(m => m.id);
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

onMounted(async () => {
  await userStore.ensureAuthProfile();
  void fetchUsers();
  void listConsolePermissions().then(items => {
    catalog.value = items;
  });
});
</script>
