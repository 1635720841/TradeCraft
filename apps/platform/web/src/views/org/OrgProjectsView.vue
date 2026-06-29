<!--
  项目管理：配置项目开放时间与成员项目内权限。
-->
<template>
  <div class="p-4 space-y-4">
    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="展示企业内全部项目。未开放、未加入或访问已过期的项目也会列出，便于了解还有哪些能力尚未开通。"
      class="mb-4"
    />

    <el-card v-if="canUpdate && accessRequests.length" shadow="never">
      <template #header>
        <span class="font-medium">待审批访问申请（{{ accessRequests.length }}）</span>
      </template>
      <el-table :data="accessRequests" size="small" stripe>
        <el-table-column label="项目" min-width="120">
          <template #default="{ row }">{{ row.project?.name ?? row.projectId }}</template>
        </el-table-column>
        <el-table-column label="申请人" min-width="160">
          <template #default="{ row }">{{ row.user?.email ?? row.userId }}</template>
        </el-table-column>
        <el-table-column prop="message" label="留言" min-width="120" show-overflow-tooltip />
        <el-table-column label="操作" width="160">
          <template #default="{ row }">
            <el-button link type="primary" @click="onApproveRequest(row.id)">批准</el-button>
            <el-button link type="danger" @click="onRejectRequest(row.id)">拒绝</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card v-loading="loading" shadow="never">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="font-medium">项目列表</span>
          <el-button v-if="canCreate" type="primary" @click="openCreate">新建项目</el-button>
        </div>
      </template>

      <div v-if="projects.length" class="mb-4 flex flex-wrap gap-2">
        <el-tag type="success">可使用 {{ summary.usable }}</el-tag>
        <el-tag type="warning">未开放 {{ summary.notOpen }}</el-tag>
        <el-tag type="info">未加入 {{ summary.notMember }}</el-tag>
        <el-tag v-if="summary.memberExpired" type="danger">
          访问过期 {{ summary.memberExpired }}
        </el-tag>
      </div>

      <el-table :data="projects" stripe :row-class-name="rowClassName" @row-click="onRowClick">
        <el-table-column prop="name" label="项目名称" min-width="160" />
        <el-table-column v-if="canCreate || canUpdate" prop="projectType" label="类型" width="120" />
        <el-table-column label="我的访问" width="110">
          <template #default="{ row }">
            <el-tooltip
              v-if="row.myAccessStatus === 'not_member'"
              content="您尚未加入该项目，可点击「管理」将自己加入"
              placement="top"
            >
              <el-tag :type="dictTagType(projectMyAccessStatusDict, row.myAccessStatus)" size="small">
                {{ dictLabel(projectMyAccessStatusDict, row.myAccessStatus) }}
              </el-tag>
            </el-tooltip>
            <el-tooltip
              v-else-if="row.myAccessStatus === 'not_open'"
              content="项目尚未到开放时间，请在管理中调整访问期"
              placement="top"
            >
              <el-tag :type="dictTagType(projectMyAccessStatusDict, row.myAccessStatus)" size="small">
                {{ dictLabel(projectMyAccessStatusDict, row.myAccessStatus) }}
              </el-tag>
            </el-tooltip>
            <el-tag
              v-else
              :type="dictTagType(projectMyAccessStatusDict, row.myAccessStatus)"
              size="small"
            >
              {{ dictLabel(projectMyAccessStatusDict, row.myAccessStatus) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column v-if="canCreate || canUpdate" label="项目开放" width="110">
          <template #default="{ row }">
            <el-tag :type="row.accessActive ? 'success' : 'warning'" size="small">
              {{ row.accessActive ? "开放中" : "未开放" }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column v-if="canCreate || canUpdate" label="开放时间" min-width="220">
          <template #default="{ row }">
            {{ formatAccessWindow(row.accessStart, row.accessEnd) }}
          </template>
        </el-table-column>
        <el-table-column v-if="canCreate || canUpdate" prop="memberCount" label="成员数" width="90" />
        <el-table-column v-if="canCreate || canUpdate" prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="dictTagType(projectStatusDict, row.status)" size="small">
              {{ dictLabel(projectStatusDict, row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.canManage"
              type="primary"
              link
              @click.stop="openManage(row)"
            >
              管理
            </el-button>
            <el-button v-else type="primary" link @click.stop="openPreview(row)">
              查看
            </el-button>
            <el-button
              v-if="row.projectType === 'seo-factory' && row.canEnter"
              type="primary"
              link
              @click.stop="enterProject(row.id)"
            >
              进入
            </el-button>
            <el-button
              v-if="row.canManage && canUpdate"
              type="danger"
              link
              @click.stop="handleDeleteProject(row)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="mt-4 flex justify-end">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="limit"
          :total="total"
          layout="total, prev, pager, next"
          @current-change="loadProjects"
        />
      </div>
    </el-card>

    <el-dialog v-model="createVisible" title="新建项目" width="480px" destroy-on-close>
      <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-width="100px">
        <el-form-item label="项目名称" prop="name">
          <el-input v-model="createForm.name" placeholder="例如：北美 SEO 内容工厂" />
        </el-form-item>
        <el-form-item label="项目类型" prop="projectType">
          <el-select v-model="createForm.projectType" class="w-full">
            <el-option
              v-for="item in projectTypes"
              :key="item.type"
              :label="item.label"
              :value="item.type"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="开放开始">
          <el-date-picker
            v-model="createForm.accessStart"
            type="datetime"
            value-format="YYYY-MM-DDTHH:mm:ss.SSS[Z]"
            placeholder="留空表示立即开放"
            class="w-full"
          />
        </el-form-item>
        <el-form-item label="开放结束">
          <el-date-picker
            v-model="createForm.accessEnd"
            type="datetime"
            value-format="YYYY-MM-DDTHH:mm:ss.SSS[Z]"
            placeholder="留空表示长期开放"
            class="w-full"
          />
        </el-form-item>
        <el-alert
          type="info"
          :closable="false"
          show-icon
          title="创建后您将自动成为项目负责人，可立即进入工作台（访问期留空即长期开放）。"
        />
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitCreate">创建</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="manageVisible" :title="drawerTitle" size="720px" destroy-on-close>
      <div v-loading="loadingDetail">
        <template v-if="detail">
          <el-form
            v-if="canUpdate && detail.canManage"
            :model="projectForm"
            label-width="100px"
            class="mb-6"
          >
            <el-form-item label="项目名称">
              <el-input v-model="projectForm.name" />
            </el-form-item>
            <el-form-item label="开放开始">
              <el-date-picker
                v-model="projectForm.accessStart"
                type="datetime"
                value-format="YYYY-MM-DDTHH:mm:ss.SSS[Z]"
                clearable
                class="w-full"
              />
            </el-form-item>
            <el-form-item label="开放结束">
              <el-date-picker
                v-model="projectForm.accessEnd"
                type="datetime"
                value-format="YYYY-MM-DDTHH:mm:ss.SSS[Z]"
                clearable
                class="w-full"
              />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="saving" @click="saveProject">保存项目设置</el-button>
            </el-form-item>
          </el-form>

          <el-alert
            v-else-if="detail"
            class="mb-4"
            :type="detail.myAccessStatus === 'usable' ? 'success' : 'warning'"
            :closable="false"
            show-icon
            :title="accessHint(detail.myAccessStatus)"
          />

          <el-alert
            v-if="detail?.canManage && detail.myAccessStatus !== 'usable'"
            class="mb-4"
            type="info"
            :closable="false"
            show-icon
            title="您可管理本项目，但尚未加入成员列表"
          >
            <template #default>
              加入后即可进入 SEO 工作台操作任务。
              <el-button
                class="ml-2"
                type="primary"
                size="small"
                :loading="joiningSelf"
                @click="joinSelfToProject"
              >
                将自己加入项目
              </el-button>
            </template>
          </el-alert>

          <div v-if="detail?.canManage" class="mb-3 flex items-center justify-between">
            <span class="font-medium">项目成员</span>
            <el-button v-if="canUpdate" type="primary" size="small" @click="openAddMember">
              添加成员
            </el-button>
          </div>

          <el-table v-if="detail?.canManage" :data="detail.members" stripe size="small">
            <el-table-column prop="email" label="邮箱" min-width="150" />
            <el-table-column prop="name" label="姓名" min-width="100">
              <template #default="{ row }">{{ row.name || "-" }}</template>
            </el-table-column>
            <el-table-column prop="role" label="项目角色" width="100">
              <template #default="{ row }">
                <el-tag :type="dictTagType(projectMemberRoleDict, row.role)" size="small">
                  {{ dictLabel(projectMemberRoleDict, row.role) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="访问状态" min-width="200">
              <template #default="{ row }">
                <div class="flex flex-wrap items-center gap-1">
                  <span class="text-sm">{{ formatAccessWindow(row.accessStart, row.accessEnd) }}</span>
                  <el-tag v-if="row.accessActive === false" type="danger" size="small">已过期</el-tag>
                  <el-tag v-else type="success" size="small">有效</el-tag>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="140" fixed="right">
              <template #default="{ row }">
                <el-button
                  v-if="canUpdate"
                  type="primary"
                  link
                  size="small"
                  @click="openMemberPerm(row)"
                >
                  权限
                </el-button>
                <el-button
                  v-if="canUpdate"
                  type="danger"
                  link
                  size="small"
                  @click="removeMember(row)"
                >
                  移除
                </el-button>
              </template>
            </el-table-column>
          </el-table>

          <div v-if="canUpdate && detail?.canManage" class="mt-8 border-t border-gray-100 pt-4">
            <div class="mb-2 text-sm font-medium text-gray-700">危险操作</div>
            <p class="mb-3 text-xs text-gray-500">
              删除后不可恢复，项目下的站点、词库与任务将全部清除。
            </p>
            <el-button type="danger" plain :loading="saving" @click="handleDeleteProject()">
              删除项目
            </el-button>
          </div>
        </template>
      </div>
    </el-drawer>

    <el-dialog v-model="addMemberVisible" title="添加项目成员" width="480px" destroy-on-close>
      <el-form :model="addMemberForm" label-width="100px">
        <el-form-item label="企业成员">
          <el-select v-model="addMemberForm.userId" filterable class="w-full" placeholder="选择成员">
            <el-option
              v-for="m in orgMembers"
              :key="m.id"
              :label="`${m.email}${m.name ? ` (${m.name})` : ''}`"
              :value="m.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="项目角色">
          <el-select v-model="addMemberForm.role" class="w-full">
            <el-option
              v-for="item in projectMemberRoleDict"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="访问开始">
          <el-date-picker
            v-model="addMemberForm.accessStart"
            type="datetime"
            value-format="YYYY-MM-DDTHH:mm:ss.SSS[Z]"
            clearable
            class="w-full"
          />
        </el-form-item>
        <el-form-item label="访问结束">
          <el-date-picker
            v-model="addMemberForm.accessEnd"
            type="datetime"
            value-format="YYYY-MM-DDTHH:mm:ss.SSS[Z]"
            clearable
            class="w-full"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addMemberVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitAddMember">添加</el-button>
      </template>
    </el-dialog>

    <el-drawer
      v-model="permDrawerVisible"
      :title="permDrawerTitle"
      size="480px"
      append-to-body
      destroy-on-close
    >
      <div v-loading="loadingPerms">
        <el-alert
          class="mb-4"
          type="info"
          :closable="false"
          show-icon
          title="须先加入项目且访问期有效，方可进入 SEO 工作台。此处配置的是项目内操作权限。"
        />

        <div class="mb-4 space-y-2">
          <div class="text-sm font-medium text-gray-700">岗位预设</div>
          <div class="flex flex-col gap-2">
            <el-button
              v-for="preset in permissionPresets"
              :key="preset.id"
              class="!justify-start !h-auto !py-2"
              @click="applyPreset(preset.permissions)"
              style="margin-left: 0px;"
            >
              <div class="text-left">
                <div>{{ preset.label }}</div>
                <div v-if="preset.description" class="text-xs font-normal text-gray-500">
                  {{ preset.description }}
                </div>
              </div>
            </el-button>
          </div>
        </div>

        <el-collapse>
          <el-collapse-item title="高级：自定义权限" name="custom">
            <el-checkbox-group :model-value="selectedGrantIds" @change="onGrantChange">
              <div class="space-y-2">
                <el-checkbox
                  v-for="perm in grantablePermissions"
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
          </el-collapse-item>
        </el-collapse>
      </div>
      <template #footer>
        <el-button @click="permDrawerVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingPerms" @click="saveMemberPermissions">
          保存权限
        </el-button>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { FormInstance, FormRules } from "element-plus";
import { ElMessageBox } from "element-plus";
import {
  addProjectMember,
  createOrgProject,
  deleteOrgProject,
  getOrgProject,
  getProjectMemberPermissions,
  listOrgProjects,
  listPermissionPresets,
  listProjectTypeCatalog,
  removeProjectMember,
  setProjectMemberPermissions,
  updateOrgProject,
  type OrgProjectDetail,
  type OrgProjectItem,
  type OrgProjectMember
} from "@/api/org/projects";
import {
  approveAccessRequest,
  listPendingAccessRequests,
  rejectAccessRequest,
  type AccessRequestItem
} from "@/api/org/access";
import { listOrganizationMembers, type OrganizationMember } from "@/api/org/organization";
import { getAuthProfile } from "@/api/user";
import { projectMemberRoleDict, projectMyAccessStatusDict, projectStatusDict } from "@/constants/dicts/platform";
import { useUserStoreHook } from "@/store/modules/user";
import { usePermissionGrantExpand } from "@/composables/usePermissionGrantExpand";
import { dictLabel, dictTagType } from "@/utils/dict";
import { hasPerms } from "@/utils/auth";
import { message } from "@/utils/message";
import { invalidateProjectAccessCache } from "@/router/guards/project-access";

defineOptions({ name: "OrgProjectsView" });

const router = useRouter();
const route = useRoute();
const userStore = useUserStoreHook();
const { expandGrantIds } = usePermissionGrantExpand();
const loading = ref(false);
const loadingDetail = ref(false);
const loadingPerms = ref(false);
const saving = ref(false);
const savingPerms = ref(false);
const projects = ref<OrgProjectItem[]>([]);
const projectTypes = ref<Array<{ type: string; label: string }>>([]);
const page = ref(1);
const limit = ref(20);
const total = ref(0);
const createVisible = ref(false);
const manageVisible = ref(false);
const addMemberVisible = ref(false);
const permDrawerVisible = ref(false);
const createFormRef = ref<FormInstance>();
const detail = ref<OrgProjectDetail | null>(null);
const activeProjectId = ref("");
const orgMembers = ref<OrganizationMember[]>([]);
const permTarget = ref<OrgProjectMember | null>(null);
const selectedGrantIds = ref<string[]>([]);
const effectivePermissions = ref<string[]>([]);
const grantablePermissions = ref<
  Array<{ id: string; name: string; description?: string }>
>([]);
const roleDefaultPermissionIds = ref<string[]>([]);
const permissionPresets = ref<Array<{ id: string; label: string; description?: string; permissions: string[] }>>([]);
const accessRequests = ref<AccessRequestItem[]>([]);
const joiningSelf = ref(false);

const permissionLabelMap = computed(() =>
  Object.fromEntries(grantablePermissions.value.map(item => [item.id, item.name]))
);

const canCreate = computed(() => hasPerms("project:create"));
const canUpdate = computed(() => hasPerms("project:update"));

const summary = computed(() => {
  const counts = {
    usable: 0,
    notOpen: 0,
    notMember: 0,
    memberExpired: 0
  };
  for (const item of projects.value) {
    if (item.myAccessStatus === "usable") counts.usable += 1;
    else if (item.myAccessStatus === "not_open") counts.notOpen += 1;
    else if (item.myAccessStatus === "not_member") counts.notMember += 1;
    else if (item.myAccessStatus === "member_expired") counts.memberExpired += 1;
  }
  return counts;
});

const drawerTitle = computed(() =>
  detail.value ? `项目管理 — ${detail.value.name}` : "项目管理"
);

const permDrawerTitle = computed(() =>
  permTarget.value ? `项目权限 — ${permTarget.value.email}` : "项目权限"
);

const createForm = reactive({
  name: "",
  projectType: "seo-factory",
  accessStart: null as string | null,
  accessEnd: null as string | null
});

const projectForm = reactive({
  name: "",
  accessStart: null as string | null,
  accessEnd: null as string | null
});

const addMemberForm = reactive({
  userId: "",
  role: "VIEWER" as "OWNER" | "EDITOR" | "VIEWER",
  accessStart: null as string | null,
  accessEnd: null as string | null
});

const createRules: FormRules = {
  name: [{ required: true, message: "请输入项目名称", trigger: "blur" }],
  projectType: [{ required: true, message: "请选择项目类型", trigger: "change" }]
};

function accessHint(status: string) {
  const map: Record<string, string> = {
    usable: "您已可使用该项目，可进入工作台。",
    not_open: "项目尚未到开放时间或已过期，请联系管理员。",
    not_member: "您尚未加入该项目，请联系管理员开通。",
    member_expired: "您的项目访问期已结束，请联系管理员续期。",
    archived: "项目已归档。"
  };
  return map[status] ?? "暂无访问权限";
}

function rowClassName({ row }: { row: OrgProjectItem }) {
  return row.myAccessStatus === "usable" ? "" : "opacity-70";
}

function onRowClick(row: OrgProjectItem) {
  if (row.canManage) {
    void openManage(row);
  } else {
    void openPreview(row);
  }
}

async function openPreview(row: OrgProjectItem) {
  activeProjectId.value = row.id;
  manageVisible.value = true;
  await loadDetail(row.id);
}

function formatAccessWindow(start: string | null, end: string | null) {
  if (!start && !end) return "长期开放";
  const fmt = (v: string | null) => (v ? new Date(v).toLocaleString("zh-CN") : "不限");
  return `${fmt(start)} ~ ${fmt(end)}`;
}

function isDefaultPermission(permId: string) {
  if (!permTarget.value) return false;
  return roleDefaultPermissionIds.value.includes(permId);
}

function onGrantChange(ids: string[]) {
  selectedGrantIds.value = expandGrantIds(ids);
}

async function loadProjects() {
  loading.value = true;
  try {
    const result = await listOrgProjects(page.value, limit.value);
    projects.value = result.items;
    total.value = result.pagination.total;
  } finally {
    loading.value = false;
  }
}

async function loadDetail(projectId: string) {
  loadingDetail.value = true;
  try {
    detail.value = await getOrgProject(projectId);
    projectForm.name = detail.value.name;
    projectForm.accessStart = detail.value.accessStart;
    projectForm.accessEnd = detail.value.accessEnd;
  } finally {
    loadingDetail.value = false;
  }
}

async function joinSelfToProject() {
  if (!activeProjectId.value) return;
  joiningSelf.value = true;
  try {
    const profile = await getAuthProfile();
    await addProjectMember(activeProjectId.value, {
      userId: profile.data.id,
      role: "OWNER"
    });
    message("已加入项目，现在可以进入工作台", { type: "success" });
    await Promise.all([loadDetail(activeProjectId.value), loadProjects()]);
  } finally {
    joiningSelf.value = false;
  }
}

function openCreate() {
  createForm.name = "";
  createForm.projectType = "seo-factory";
  createForm.accessStart = null;
  createForm.accessEnd = null;
  createVisible.value = true;
}

async function submitCreate() {
  if (!createFormRef.value) return;
  await createFormRef.value.validate();
  saving.value = true;
  try {
    const project = await createOrgProject({
      name: createForm.name,
      projectType: createForm.projectType,
      accessStart: createForm.accessStart,
      accessEnd: createForm.accessEnd
    });
    createVisible.value = false;
    invalidateProjectAccessCache(project.id);
    await loadProjects();
    if (project.projectType === "seo-factory") {
      try {
        await ElMessageBox.confirm(
          "项目已创建，您已自动成为项目负责人。是否进入 SEO 工作台？",
          "创建成功",
          { confirmButtonText: "进入工作台", cancelButtonText: "继续管理", type: "success" }
        );
        enterProject(project.id);
      } catch {
        message("项目已创建", { type: "success" });
      }
    } else {
      message("项目已创建", { type: "success" });
    }
  } finally {
    saving.value = false;
  }
}

async function openManage(row: OrgProjectItem) {
  activeProjectId.value = row.id;
  manageVisible.value = true;
  await loadDetail(row.id);
}

async function saveProject() {
  if (!activeProjectId.value) return;
  saving.value = true;
  try {
    await updateOrgProject(activeProjectId.value, {
      name: projectForm.name,
      accessStart: projectForm.accessStart,
      accessEnd: projectForm.accessEnd
    });
    message("项目设置已保存", { type: "success" });
    await loadDetail(activeProjectId.value);
    await loadProjects();
  } finally {
    saving.value = false;
  }
}

async function handleDeleteProject(row?: OrgProjectItem | OrgProjectDetail) {
  const target = row ?? detail.value;
  if (!target) return;

  await ElMessageBox.confirm(
    `确定删除项目「${target.name}」？此操作不可恢复，项目下的站点、词库与任务将全部删除。`,
    "删除确认",
    { type: "warning", confirmButtonText: "删除", cancelButtonText: "取消" }
  );

  saving.value = true;
  try {
    await deleteOrgProject(target.id);
    message("项目已删除", { type: "success" });
    manageVisible.value = false;
    detail.value = null;
    activeProjectId.value = "";
    await loadProjects();
  } finally {
    saving.value = false;
  }
}

async function openAddMember() {
  orgMembers.value = await listOrganizationMembers();
  addMemberForm.userId = "";
  addMemberForm.role = "VIEWER";
  addMemberForm.accessStart = null;
  addMemberForm.accessEnd = null;
  addMemberVisible.value = true;
}

async function submitAddMember() {
  if (!activeProjectId.value || !addMemberForm.userId) {
    message("请选择成员", { type: "warning" });
    return;
  }
  saving.value = true;
  try {
    await addProjectMember(activeProjectId.value, { ...addMemberForm });
    addMemberVisible.value = false;
    message("成员已添加", { type: "success" });
    invalidateProjectAccessCache(activeProjectId.value);
    await loadDetail(activeProjectId.value);
    await loadProjects();
  } finally {
    saving.value = false;
  }
}

async function removeMember(member: OrgProjectMember) {
  if (!activeProjectId.value) return;
  await ElMessageBox.confirm(`确定将 ${member.email} 移出该项目？`, "移除成员", {
    type: "warning"
  });
  await removeProjectMember(activeProjectId.value, member.userId);
  message("成员已移除", { type: "success" });
  invalidateProjectAccessCache(activeProjectId.value);
  await loadDetail(activeProjectId.value);
  await loadProjects();
}

async function openMemberPerm(member: OrgProjectMember) {
  if (!activeProjectId.value) return;
  permTarget.value = member;
  permDrawerVisible.value = true;
  loadingPerms.value = true;
  try {
    const result = await getProjectMemberPermissions(activeProjectId.value, member.userId);
    selectedGrantIds.value = [...result.grants];
    effectivePermissions.value = result.effectivePermissions;
    grantablePermissions.value = result.grantablePermissions ?? [];
    roleDefaultPermissionIds.value = result.roleDefaultPermissionIds ?? [];
  } finally {
    loadingPerms.value = false;
  }
}

async function saveMemberPermissions() {
  if (!activeProjectId.value || !permTarget.value) return;
  savingPerms.value = true;
  try {
    const result = await setProjectMemberPermissions(
      activeProjectId.value,
      permTarget.value.userId,
      selectedGrantIds.value
    );
    selectedGrantIds.value = [...result.grants];
    effectivePermissions.value = result.effectivePermissions;
    message("项目权限已保存", { type: "success" });
    invalidateProjectAccessCache(activeProjectId.value);
    await loadDetail(activeProjectId.value);
  } finally {
    savingPerms.value = false;
  }
}

function enterProject(projectId: string) {
  router.push(`/projects/${projectId}/seo-factory/overview`);
}

function applyPreset(permissions: string[]) {
  selectedGrantIds.value = expandGrantIds(permissions);
}

async function loadAccessRequests() {
  if (!canUpdate.value) return;
  try {
    accessRequests.value = await listPendingAccessRequests();
  } catch {
    accessRequests.value = [];
  }
}

async function onApproveRequest(id: string) {
  await approveAccessRequest(id, "executor");
  message("已批准访问申请", { type: "success" });
  await loadAccessRequests();
  await loadProjects();
}

async function onRejectRequest(id: string) {
  await rejectAccessRequest(id);
  message("已拒绝", { type: "info" });
  await loadAccessRequests();
}

async function handleRouteQuery() {
  const openManage = route.query.openManage;
  const openPerm = route.query.openPerm;
  const preset = route.query.preset;
  if (typeof openManage === "string") {
    const row = projects.value.find(p => p.id === openManage);
    if (row) await openManage(row);
  } else if (typeof openPerm === "string") {
    const row = projects.value.find(p => p.id === openPerm);
    if (row) {
      await openManage(row);
      const self = detail.value?.members.find(m => m.userId === userStore.userId);
      if (self) {
        await openMemberPerm(self);
        if (typeof preset === "string") {
          const p = permissionPresets.value.find(x => x.id === preset);
          if (p) applyPreset(p.permissions);
        }
      }
    }
  }
}

onMounted(async () => {
  await loadProjects();
  void listProjectTypeCatalog().then(types => {
    projectTypes.value = types;
  });
  void listPermissionPresets().then(p => {
    permissionPresets.value = p;
  });
  void loadAccessRequests();
  await handleRouteQuery();
});
</script>
