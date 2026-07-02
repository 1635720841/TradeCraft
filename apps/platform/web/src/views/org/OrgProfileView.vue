<!--
  企业资料页：基本信息、配额摘要与名称编辑。
-->
<template>
  <AdminPageShell title="企业资料" description="基本信息、配额摘要与通知偏好。">
    <template #actions>
      <el-button link type="primary" :loading="profileLoading" @click="retryProfile">
        刷新
      </el-button>
    </template>

    <AsyncErrorAlert
      :message="profileError"
      title="企业资料加载失败"
      @retry="retryProfile"
    />

    <template v-if="profileData">
        <div class="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div class="text-sm text-gray-500">企业名称</div>
            <div class="text-2xl font-medium">{{ profileData.name }}</div>
          </div>
          <el-statistic title="成员数" :value="profileData.memberCount" />
          <el-statistic title="项目数" :value="profileData.projectCount" />
          <el-statistic
            title="本账期剩余配额"
            :value="profileData.quota.remaining"
            suffix="篇"
          />
        </div>

        <QuotaSummaryCard :quota="profileData.quota" class="mb-4">
          <template v-if="canViewBilling" #action>
            <router-link to="/org/billing" class="text-sm text-primary">
              查看订阅与配额详情 →
            </router-link>
          </template>
        </QuotaSummaryCard>

        <el-descriptions :column="2" border class="mb-4 max-w-3xl">
          <el-descriptions-item label="企业 ID">{{ profileData.id }}</el-descriptions-item>
          <el-descriptions-item label="套餐">
            {{ dictLabel(planNameDict, profileData.planName) }}
          </el-descriptions-item>
          <el-descriptions-item label="订阅状态">
            <el-tag :type="dictTagType(subscriptionStatusDict, profileData.subscriptionStatus)">
              {{ dictLabel(subscriptionStatusDict, profileData.subscriptionStatus) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="企业有效时间">
            {{ formatPeriodWindow(profileData.currentPeriodStart, profileData.currentPeriodEnd) }}
            <span
              v-if="profileData.quota.daysRemaining != null && profileData.currentPeriodEnd"
              class="ml-2 text-sm"
              :class="profileData.quota.subscriptionActive ? 'text-gray-500' : 'text-red-500'"
            >
              （{{
                profileData.quota.subscriptionActive
                  ? `剩余 ${profileData.quota.daysRemaining} 天`
                  : "已过期"
              }}）
            </span>
          </el-descriptions-item>
          <el-descriptions-item label="创建时间">
            {{ formatTime(profileData.createdAt) }}
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

    <el-divider />

    <div v-loading="prefLoading" class="space-y-4">
      <div class="font-medium">通知偏好</div>
      <p class="mb-4 text-sm text-gray-500">
        控制邮件通知开关，以及需要静音的通知类型。
      </p>
      <el-form label-width="120px" class="max-w-xl">
        <el-form-item label="邮件通知">
          <el-switch v-model="notifPref.emailEnabled" />
        </el-form-item>
        <el-form-item label="静音类型">
          <el-checkbox-group v-model="notifPref.mutedTypes">
            <el-checkbox
              v-for="opt in notificationTypeOptions"
              :key="opt.value"
              :label="opt.value"
            >
              {{ opt.label }}
            </el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="prefSaving" @click="saveNotificationPreferences">
            保存偏好
          </el-button>
        </el-form-item>
      </el-form>
    </div>

    <el-divider v-if="canManageIntegration" />

    <div v-if="canManageIntegration">
      <p class="mb-3 text-sm text-gray-500">
        配置钉钉/飞书机器人、出站 Webhook 与投递记录。
      </p>
      <router-link to="/org/integrations" class="text-primary text-sm">
        前往集成配置 →
      </router-link>
    </div>
  </AdminPageShell>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import AdminPageShell from "@/components/layout/AdminPageShell.vue";
import {
  getOrganizationProfile,
  updateOrganizationProfile
} from "@/api/org/organization";
import { useAsyncData } from "@/composables/useAsyncData";
import {
  NOTIFICATION_TYPE_OPTIONS,
  getNotificationPreferences,
  updateNotificationPreferences
} from "@/api/org/notification-preferences";
import {
  planNameDict,
  subscriptionStatusDict
} from "@/constants/dicts/platform";
import { dictLabel, dictTagType } from "@/utils/dict";
import { hasPerms } from "@/utils/auth";
import { formatPeriodWindow } from "@/utils/period";
import { message } from "@/utils/message";
import QuotaSummaryCard from "@/components/org/QuotaSummaryCard.vue";
import AsyncErrorAlert from "@/components/feedback/AsyncErrorAlert.vue";

defineOptions({ name: "OrgProfileView" });

const {
  data: profileData,
  loading: profileLoading,
  error: profileError,
  load: loadProfile,
  retry: retryProfile
} = useAsyncData(getOrganizationProfile);
const saving = ref(false);
const form = reactive({ name: "" });

watch(profileData, (profile) => {
  if (profile) form.name = profile.name;
});

const canEdit = computed(() => hasPerms("org:profile:update"));
const canViewBilling = computed(() => hasPerms("org:billing:read"));
const canManageIntegration = computed(() => hasPerms("org:integration:manage"));

const prefLoading = ref(false);
const prefSaving = ref(false);
const notificationTypeOptions = NOTIFICATION_TYPE_OPTIONS;
const notifPref = reactive({ emailEnabled: true, mutedTypes: [] as string[] });

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("zh-CN");
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
    await retryProfile();
  } finally {
    saving.value = false;
  }
}

async function loadNotificationPreferences() {
  prefLoading.value = true;
  try {
    const pref = await getNotificationPreferences();
    notifPref.emailEnabled = pref.emailEnabled;
    notifPref.mutedTypes = [...pref.mutedTypes];
  } finally {
    prefLoading.value = false;
  }
}

async function saveNotificationPreferences() {
  prefSaving.value = true;
  try {
    await updateNotificationPreferences({
      emailEnabled: notifPref.emailEnabled,
      mutedTypes: notifPref.mutedTypes
    });
    message("通知偏好已保存", { type: "success" });
  } finally {
    prefSaving.value = false;
  }
}

onMounted(() => {
  void loadProfile();
  void loadNotificationPreferences();
});
</script>
