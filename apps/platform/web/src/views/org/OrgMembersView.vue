<!--
  成员与权限页：成员列表、搜索与权限配置。
-->
<template>
  <div class="p-4">
    <el-card v-loading="loading" shadow="never">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="font-medium">成员与权限</span>
          <div class="flex flex-wrap gap-2">
            <el-input
              v-model="keyword"
              placeholder="搜索邮箱或姓名"
              clearable
              class="w-52"
            />
            <el-button v-if="canCreate" type="primary" @click="openCreate">
              添加成员
            </el-button>
          </div>
        </div>
      </template>

      <el-table :data="filteredMembers" stripe>
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
        <el-table-column prop="createdAt" label="加入时间" min-width="170">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="canUpdate && row.role !== 'SUPER_ADMIN' && row.role !== 'PLATFORM_OPERATOR'"
              type="primary"
              link
              @click="openEdit(row as OrganizationMember)"
            >
              编辑
            </el-button>
            <el-button
              v-if="canGrant && row.role !== 'SUPER_ADMIN' && row.role !== 'PLATFORM_OPERATOR'"
              type="primary"
              link
              @click="openPermissions(row as OrganizationMember)"
            >
              配置权限
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="editingId ? '编辑成员' : '添加成员'"
      width="460px"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="72px">
        <el-form-item v-if="!editingId" label="邮箱" prop="email">
          <el-input v-model="form.email" placeholder="user@company.com" />
        </el-form-item>
        <el-form-item v-if="!editingId" label="密码" prop="password">
          <el-input v-model="form.password" type="password" show-password />
        </el-form-item>
        <el-form-item label="姓名" prop="name">
          <el-input v-model="form.name" maxlength="64" />
        </el-form-item>
        <el-form-item label="角色" prop="role">
          <el-select v-model="form.role" class="w-full">
            <el-option
              v-for="item in editableRoles"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            >
              <span>{{ item.label }}</span>
              <span v-if="item.description" class="ml-2 text-xs text-gray-400">
                {{ item.description }}
              </span>
            </el-option>
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitForm">保存</el-button>
      </template>
    </el-dialog>

    <el-drawer
      v-model="permDrawerVisible"
      :title="permDrawerTitle"
      size="520px"
      destroy-on-close
    >
      <div v-loading="loadingPerms">
        <el-alert
          class="mb-4"
          type="info"
          :closable="false"
          show-icon
          :title="`角色默认权限：${defaultPermHint}`"
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

        <div v-for="group in permissionGroups" :key="group.module" class="mb-4">
          <div class="mb-2 font-medium text-gray-700">{{ group.label }}</div>

          <template v-if="group.module === 'org'">
            <div
              v-for="section in group.sections"
              :key="section.key"
              class="mb-3 rounded-lg border border-gray-100 p-3"
            >
              <div class="mb-2 text-sm font-medium text-gray-600">
                {{ section.label }}
              </div>
              <el-checkbox-group
                :model-value="selectedGrantIds"
                @change="onGrantChange"
              >
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
          </template>

          <el-checkbox-group
            v-else
            :model-value="selectedGrantIds"
            @change="onGrantChange"
          >
            <div class="grid grid-cols-1 gap-2">
              <el-checkbox
                v-for="perm in group.items"
                :key="perm.id"
                :value="perm.id"
                :disabled="isDefaultPermission(perm.id)"
              >
                {{ perm.name }}
              </el-checkbox>
            </div>
          </el-checkbox-group>
        </div>
      </div>
      <template #footer>
        <el-button @click="permDrawerVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingPerms" @click="savePermissions">
          保存权限
        </el-button>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import type { FormInstance, FormRules } from "element-plus";
import {
  getMemberPermissions,
  listPermissionCatalog,
  setMemberPermissions,
  type PermissionDefinition
} from "@/api/org/access";
import {
  createOrganizationMember,
  listOrganizationMembers,
  updateOrganizationMember,
  type OrganizationMember
} from "@/api/org/organization";
import { memberRoleDict } from "@/constants/dicts/platform";
import {
  ORG_PERMISSION_SECTIONS,
  PERMISSION_IMPLIES,
  PERMISSION_MODULE_LABELS,
  ROLE_DEFAULT_PERMISSION_IDS
} from "@/constants/platform-access";
import { dictLabel, dictTagType } from "@/utils/dict";
import { hasPerms } from "@/utils/auth";
import { message } from "@/utils/message";

defineOptions({ name: "OrgMembersView" });

const loading = ref(false);
const saving = ref(false);
const savingPerms = ref(false);
const loadingPerms = ref(false);
const members = ref<OrganizationMember[]>([]);
const keyword = ref("");
const catalog = ref<PermissionDefinition[]>([]);
const dialogVisible = ref(false);
const editingId = ref("");
const formRef = ref<FormInstance>();

const permDrawerVisible = ref(false);
const permTarget = ref<OrganizationMember | null>(null);
const selectedGrantIds = ref<string[]>([]);
const effectivePermissions = ref<string[]>([]);

const form = reactive({
  email: "",
  password: "",
  name: "",
  role: "MEMBER" as "ADMIN" | "MEMBER"
});

const canCreate = computed(() => hasPerms("org:member:create"));
const canUpdate = computed(() => hasPerms("org:member:update"));
const canGrant = computed(() => hasPerms("org:member:grant"));
const editableRoles = computed(() =>
  memberRoleDict.filter(
    item => item.value !== "SUPER_ADMIN" && item.value !== "PLATFORM_OPERATOR"
  )
);

const filteredMembers = computed(() => {
  const q = keyword.value.trim().toLowerCase();
  if (!q) return members.value;
  return members.value.filter(
    m =>
      m.email.toLowerCase().includes(q) ||
      (m.name?.toLowerCase().includes(q) ?? false)
  );
});

const permDrawerTitle = computed(() =>
  permTarget.value ? `权限配置 — ${permTarget.value.email}` : "权限配置"
);

const permissionNameMap = computed(() =>
  Object.fromEntries(catalog.value.map(p => [p.id, p.name]))
);

const grantableCatalog = computed(() =>
  catalog.value.filter(item => !item.id.startsWith("console:"))
);

const permissionGroups = computed(() => {
  const map = new Map<string, PermissionDefinition[]>();
  for (const item of grantableCatalog.value) {
    const list = map.get(item.module) ?? [];
    list.push(item);
    map.set(item.module, list);
  }
  return [...map.entries()].map(([module, items]) => {
    const sorted = items.sort((a, b) => a.sortOrder - b.sortOrder);
    if (module === "org") {
      const sections = ORG_PERMISSION_SECTIONS.map(section => ({
        ...section,
        items: sorted.filter(item => section.match(item.id))
      })).filter(section => section.items.length > 0);
      return { module, label: PERMISSION_MODULE_LABELS[module] ?? module, sections, items: sorted };
    }
    return { module, label: PERMISSION_MODULE_LABELS[module] ?? module, sections: [], items: sorted };
  });
});

const defaultPermHint = computed(() => {
  if (!permTarget.value) return "-";
  const defaults = ROLE_DEFAULT_PERMISSION_IDS[permTarget.value.role] ?? [];
  return defaults.length ? `${defaults.length} 项（默认已生效）` : "无";
});

const rules = computed<FormRules>(() => ({
  email: editingId.value ? [] : [{ required: true, message: "请输入邮箱", trigger: "blur" }],
  password: editingId.value
    ? []
    : [
        { required: true, message: "请输入初始密码", trigger: "blur" },
        { min: 6, message: "密码至少 6 位", trigger: "blur" }
      ],
  role: [{ required: true, message: "请选择角色", trigger: "change" }]
}));

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("zh-CN");
}

function isDefaultPermission(permId: string) {
  if (!permTarget.value) return false;
  const defaults = ROLE_DEFAULT_PERMISSION_IDS[permTarget.value.role] ?? [];
  return defaults.includes(permId);
}

function expandGrantIds(ids: string[]) {
  const expanded = new Set(ids);
  for (const id of ids) {
    for (const implied of PERMISSION_IMPLIES[id] ?? []) {
      expanded.add(implied);
    }
  }
  return [...expanded];
}

function onGrantChange(ids: string[]) {
  selectedGrantIds.value = expandGrantIds(ids);
}

async function loadMembers() {
  loading.value = true;
  try {
    members.value = await listOrganizationMembers();
  } finally {
    loading.value = false;
  }
}

async function loadCatalog() {
  catalog.value = await listPermissionCatalog();
}

function resetForm() {
  form.email = "";
  form.password = "";
  form.name = "";
  form.role = "MEMBER";
}

function openCreate() {
  editingId.value = "";
  resetForm();
  dialogVisible.value = true;
}

function openEdit(member: OrganizationMember) {
  if (member.role === "SUPER_ADMIN" || member.role === "PLATFORM_OPERATOR") {
    message("平台账号不可在此修改", { type: "warning" });
    return;
  }
  editingId.value = member.id;
  form.email = member.email;
  form.password = "";
  form.name = member.name ?? "";
  form.role = member.role === "ADMIN" ? "ADMIN" : "MEMBER";
  dialogVisible.value = true;
}

async function openPermissions(member: OrganizationMember) {
  permTarget.value = member;
  permDrawerVisible.value = true;
  loadingPerms.value = true;
  try {
    const result = await getMemberPermissions(member.id);
    selectedGrantIds.value = [...result.grants];
    effectivePermissions.value = result.effectivePermissions;
  } finally {
    loadingPerms.value = false;
  }
}

async function submitForm() {
  if (!formRef.value) return;
  await formRef.value.validate(async valid => {
    if (!valid) return;
    saving.value = true;
    try {
      if (editingId.value) {
        await updateOrganizationMember(editingId.value, {
          name: form.name.trim() || undefined,
          role: form.role
        });
        message("成员已更新", { type: "success" });
      } else {
        await createOrganizationMember({
          email: form.email.trim(),
          password: form.password,
          name: form.name.trim() || undefined,
          role: form.role
        });
        message("成员已创建", { type: "success" });
      }
      dialogVisible.value = false;
      await loadMembers();
    } finally {
      saving.value = false;
    }
  });
}

async function savePermissions() {
  if (!permTarget.value) return;
  savingPerms.value = true;
  try {
    const result = await setMemberPermissions(
      permTarget.value.id,
      selectedGrantIds.value
    );
    selectedGrantIds.value = [...result.grants];
    effectivePermissions.value = result.effectivePermissions;
    message("权限已保存", { type: "success" });
  } finally {
    savingPerms.value = false;
  }
}

onMounted(async () => {
  await Promise.all([loadMembers(), loadCatalog()]);
});
</script>
