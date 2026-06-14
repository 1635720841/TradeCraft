<!--
  企业设置页：企业信息、配额与成员管理。

  边界：
  - 不负责：登录鉴权（Auth 模块）
-->
<template>
  <div class="p-4 space-y-4">
    <el-card v-loading="loadingProfile" shadow="never">
      <template #header>
        <div class="flex items-center justify-between">
          <span class="font-medium">企业信息</span>
          <el-button link type="primary" @click="loadProfile">刷新</el-button>
        </div>
      </template>

      <template v-if="profile">
        <div class="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <el-statistic title="套餐">
            <template #default>
              {{ dictLabel(planNameDict, profile.planName) }}
            </template>
          </el-statistic>
          <el-statistic title="成员数" :value="profile.memberCount" />
          <el-statistic title="项目数" :value="profile.projectCount" />
          <el-statistic
            title="本月剩余配额"
            :value="profile.quota.remaining"
            suffix="篇"
          />
        </div>

        <el-progress
          class="mb-4"
          :percentage="quotaPercent"
          :status="quotaPercent >= 90 ? 'exception' : quotaPercent >= 70 ? 'warning' : 'success'"
          :stroke-width="12"
        >
          <span class="text-sm">
            已占用 {{ profile.quota.reservedTotal }} / {{ profile.quota.monthlyQuota }} 篇
          </span>
        </el-progress>

        <el-descriptions :column="1" border class="mb-4">
          <el-descriptions-item label="企业名称">{{ profile.name }}</el-descriptions-item>
          <el-descriptions-item label="企业 ID">{{ profile.id }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">
            {{ formatTime(profile.createdAt) }}
          </el-descriptions-item>
          <el-descriptions-item label="本月已完成">
            {{ profile.quota.usedThisMonth }} 篇
          </el-descriptions-item>
          <el-descriptions-item label="进行中任务">
            {{ profile.quota.inFlightJobs }} 篇
          </el-descriptions-item>
        </el-descriptions>

        <el-form
          v-if="isAdmin"
          ref="orgFormRef"
          :model="orgForm"
          label-width="120px"
          class="max-w-xl"
        >
          <el-form-item label="企业名称">
            <el-input v-model="orgForm.name" maxlength="120" />
          </el-form-item>
          <el-form-item label="套餐标识">
            <el-select v-model="orgForm.planName" class="w-full">
              <el-option
                v-for="item in planNameDict"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="月文章配额">
            <el-input-number v-model="orgForm.monthlyArticleQuota" :min="1" :max="100000" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="savingOrg" @click="saveOrganization">
              保存企业设置
            </el-button>
          </el-form-item>
        </el-form>
      </template>
    </el-card>

    <el-card v-if="isAdmin" v-loading="loadingMembers" shadow="never">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="font-medium">成员管理</span>
          <el-button type="primary" @click="openCreateMember">添加成员</el-button>
        </div>
      </template>

      <el-table :data="members" stripe>
        <el-table-column prop="email" label="邮箱" min-width="180" />
        <el-table-column prop="name" label="姓名" min-width="120">
          <template #default="{ row }">
            {{ row.name || "-" }}
          </template>
        </el-table-column>
        <el-table-column prop="role" label="角色" width="120">
          <template #default="{ row }">
            <el-tag :type="dictTagType(memberRoleDict, row.role)">
              {{ dictLabel(memberRoleDict, row.role) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="加入时间" min-width="170">
          <template #default="{ row }">
            {{ formatTime(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="openEditMember(row as OrganizationMember)">
              编辑
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog
      v-model="memberDialogVisible"
      :title="editingMemberId ? '编辑成员' : '添加成员'"
      width="460px"
      destroy-on-close
    >
      <el-form ref="memberFormRef" :model="memberForm" :rules="memberRules" label-width="72px">
        <el-form-item v-if="!editingMemberId" label="邮箱" prop="email">
          <el-input v-model="memberForm.email" placeholder="user@company.com" />
        </el-form-item>
        <el-form-item v-if="!editingMemberId" label="密码" prop="password">
          <el-input v-model="memberForm.password" type="password" show-password />
        </el-form-item>
        <el-form-item label="姓名" prop="name">
          <el-input v-model="memberForm.name" maxlength="64" />
        </el-form-item>
        <el-form-item label="角色" prop="role">
          <el-select v-model="memberForm.role" class="w-full">
            <el-option
              v-for="item in memberRoleDict"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="memberDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingMember" @click="submitMemberForm">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import type { FormInstance, FormRules } from "element-plus";
import {
  createOrganizationMember,
  getOrganizationProfile,
  listOrganizationMembers,
  updateOrganizationMember,
  updateOrganizationProfile,
  type OrganizationMember,
  type OrganizationProfile
} from "@/api/platform/organization";
import { memberRoleDict, planNameDict } from "@/constants/dicts/platform";
import { dictLabel, dictTagType } from "@/utils/dict";
import { message } from "@/utils/message";
import { useUserStoreHook } from "@/store/modules/user";

defineOptions({ name: "OrganizationSettingsView" });

const userStore = useUserStoreHook();
const isAdmin = computed(() => userStore.roles.includes("admin"));

const loadingProfile = ref(false);
const loadingMembers = ref(false);
const savingOrg = ref(false);
const savingMember = ref(false);
const profile = ref<OrganizationProfile | null>(null);
const members = ref<OrganizationMember[]>([]);

const orgFormRef = ref<FormInstance>();
const orgForm = reactive({
  name: "",
  planName: "trial",
  monthlyArticleQuota: 100
});

const memberDialogVisible = ref(false);
const editingMemberId = ref("");
const memberFormRef = ref<FormInstance>();
const memberForm = reactive({
  email: "",
  password: "",
  name: "",
  role: "MEMBER" as "ADMIN" | "MEMBER"
});

const memberRules = computed<FormRules>(() => ({
  email: editingMemberId.value
    ? []
    : [{ required: true, message: "请输入邮箱", trigger: "blur" }],
  password: editingMemberId.value
    ? []
    : [
        { required: true, message: "请输入初始密码", trigger: "blur" },
        { min: 6, message: "密码至少 6 位", trigger: "blur" }
      ],
  role: [{ required: true, message: "请选择角色", trigger: "change" }]
}));

const quotaPercent = computed(() => {
  if (!profile.value?.quota.monthlyQuota) return 0;
  return Math.min(
    100,
    Math.round((profile.value.quota.reservedTotal / profile.value.quota.monthlyQuota) * 100)
  );
});

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("zh-CN");
}

async function loadProfile() {
  loadingProfile.value = true;
  try {
    profile.value = await getOrganizationProfile();
    orgForm.name = profile.value.name;
    orgForm.planName = profile.value.planName;
    orgForm.monthlyArticleQuota = profile.value.monthlyArticleQuota;
  } finally {
    loadingProfile.value = false;
  }
}

async function loadMembers() {
  if (!isAdmin.value) return;
  loadingMembers.value = true;
  try {
    members.value = await listOrganizationMembers();
  } finally {
    loadingMembers.value = false;
  }
}

async function saveOrganization() {
  savingOrg.value = true;
  try {
    await updateOrganizationProfile({
      name: orgForm.name.trim(),
      planName: orgForm.planName,
      monthlyArticleQuota: orgForm.monthlyArticleQuota
    });
    message("企业设置已保存", { type: "success" });
    await loadProfile();
  } finally {
    savingOrg.value = false;
  }
}

function resetMemberForm() {
  memberForm.email = "";
  memberForm.password = "";
  memberForm.name = "";
  memberForm.role = "MEMBER";
}

function openCreateMember() {
  editingMemberId.value = "";
  resetMemberForm();
  memberDialogVisible.value = true;
}

function openEditMember(member: OrganizationMember) {
  editingMemberId.value = member.id;
  memberForm.email = member.email;
  memberForm.password = "";
  memberForm.name = member.name ?? "";
  memberForm.role = member.role;
  memberDialogVisible.value = true;
}

async function submitMemberForm() {
  if (!memberFormRef.value) return;
  await memberFormRef.value.validate(async (valid) => {
    if (!valid) return;
    savingMember.value = true;
    try {
      if (editingMemberId.value) {
        await updateOrganizationMember(editingMemberId.value, {
          name: memberForm.name.trim() || undefined,
          role: memberForm.role
        });
        message("成员已更新", { type: "success" });
      } else {
        await createOrganizationMember({
          email: memberForm.email.trim(),
          password: memberForm.password,
          name: memberForm.name.trim() || undefined,
          role: memberForm.role
        });
        message("成员已创建", { type: "success" });
      }
      memberDialogVisible.value = false;
      await Promise.all([loadMembers(), loadProfile()]);
    } finally {
      savingMember.value = false;
    }
  });
}

onMounted(async () => {
  await loadProfile();
  await loadMembers();
});
</script>
