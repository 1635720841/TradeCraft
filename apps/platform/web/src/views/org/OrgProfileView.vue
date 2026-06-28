<!--
  企业资料页：基本信息、配额摘要与名称编辑。
-->
<template>
  <div class="p-4 space-y-4">
    <el-card v-loading="loading" shadow="never">
      <template #header>
        <div class="flex items-center justify-between">
          <span class="font-medium">企业资料</span>
          <el-button link type="primary" @click="loadProfile">刷新</el-button>
        </div>
      </template>

      <template v-if="profile">
        <div class="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div class="text-sm text-gray-500">企业名称</div>
            <div class="text-2xl font-medium">{{ profile.name }}</div>
          </div>
          <el-statistic title="成员数" :value="profile.memberCount" />
          <el-statistic title="项目数" :value="profile.projectCount" />
          <el-statistic
            title="本账期剩余配额"
            :value="profile.quota.remaining"
            suffix="篇"
          />
        </div>

        <el-card shadow="never" class="mb-4 border border-gray-100">
          <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span class="text-sm font-medium text-gray-700">配额使用</span>
            <router-link
              v-if="canViewBilling"
              to="/org/billing"
              class="text-sm text-primary"
            >
              查看订阅与配额详情 →
            </router-link>
          </div>
          <el-progress
            :percentage="quotaPercent"
            :status="quotaPercent >= 90 ? 'exception' : quotaPercent >= 70 ? 'warning' : 'success'"
            :stroke-width="12"
          >
            <span class="text-sm">
              已占用 {{ profile.quota.reservedTotal }} / {{ profile.quota.periodQuota }} 篇
            </span>
          </el-progress>
        </el-card>

        <el-descriptions :column="2" border class="mb-4 max-w-3xl">
          <el-descriptions-item label="企业 ID">{{ profile.id }}</el-descriptions-item>
          <el-descriptions-item label="套餐">
            {{ dictLabel(planNameDict, profile.planName) }}
          </el-descriptions-item>
          <el-descriptions-item label="订阅状态">
            <el-tag :type="dictTagType(subscriptionStatusDict, profile.subscriptionStatus)">
              {{ dictLabel(subscriptionStatusDict, profile.subscriptionStatus) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="企业有效时间">
            {{ formatPeriodWindow(profile.currentPeriodStart, profile.currentPeriodEnd) }}
            <span
              v-if="profile.quota.daysRemaining != null && profile.currentPeriodEnd"
              class="ml-2 text-sm"
              :class="profile.quota.subscriptionActive ? 'text-gray-500' : 'text-red-500'"
            >
              （{{
                profile.quota.subscriptionActive
                  ? `剩余 ${profile.quota.daysRemaining} 天`
                  : "已过期"
              }}）
            </span>
          </el-descriptions-item>
          <el-descriptions-item label="创建时间">
            {{ formatTime(profile.createdAt) }}
          </el-descriptions-item>
        </el-descriptions>

        <el-form
          v-if="canEdit"
          ref="formRef"
          :model="form"
          label-width="100px"
          class="max-w-xl"
        >
          <el-form-item label="企业名称">
            <el-input v-model="form.name" maxlength="120" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="saving" @click="saveProfile">
              保存
            </el-button>
          </el-form-item>
        </el-form>
        <el-alert
          v-else
          type="info"
          :closable="false"
          show-icon
          title="当前账号仅可查看企业资料，如需修改请联系管理员。"
        />
      </template>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import {
  getOrganizationProfile,
  updateOrganizationProfile,
  type OrganizationProfile
} from "@/api/org/organization";
import {
  planNameDict,
  subscriptionStatusDict
} from "@/constants/dicts/platform";
import { dictLabel, dictTagType } from "@/utils/dict";
import { hasPerms } from "@/utils/auth";
import { formatPeriodWindow } from "@/utils/period";
import { message } from "@/utils/message";

defineOptions({ name: "OrgProfileView" });

const loading = ref(false);
const saving = ref(false);
const profile = ref<OrganizationProfile | null>(null);
const form = reactive({ name: "" });

const canEdit = computed(() => hasPerms("org:profile:update"));
const canViewBilling = computed(() => hasPerms("org:billing:read"));

const quotaPercent = computed(() => {
  const quota = profile.value?.quota;
  if (!quota?.periodQuota) return 0;
  return Math.min(
    100,
    Math.round((quota.reservedTotal / quota.periodQuota) * 100)
  );
});

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("zh-CN");
}

async function loadProfile() {
  loading.value = true;
  try {
    profile.value = await getOrganizationProfile();
    form.name = profile.value.name;
  } finally {
    loading.value = false;
  }
}

async function saveProfile() {
  if (!form.name.trim()) {
    message("企业名称不能为空", { type: "warning" });
    return;
  }
  saving.value = true;
  try {
    await updateOrganizationProfile({ name: form.name.trim() });
    message("企业资料已保存", { type: "success" });
    await loadProfile();
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void loadProfile();
});
</script>
