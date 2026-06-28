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

    <el-card v-if="canManageIntegration" v-loading="webhooksLoading" shadow="never">
      <template #header>
        <div class="flex items-center justify-between">
          <span class="font-medium">出站 Webhook</span>
          <el-button type="primary" size="small" @click="openWebhookDialog()">
            添加 Webhook
          </el-button>
        </div>
      </template>
      <p class="mb-4 text-sm text-gray-500">
        订阅平台事件并推送到您的 HTTPS 端点（HMAC 签名验证）。
      </p>
      <el-table :data="webhooks" stripe>
        <el-table-column prop="url" label="URL" min-width="220" />
        <el-table-column prop="events" label="事件" min-width="180">
          <template #default="{ row }">
            <el-tag v-for="ev in row.events" :key="ev" class="mr-1 mb-1" size="small">
              {{ webhookEventLabel(ev) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="isActive" label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.isActive ? 'success' : 'info'">
              {{ row.isActive ? "启用" : "停用" }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openWebhookDialog(row)">编辑</el-button>
            <el-button link type="danger" @click="removeWebhook(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="webhookDialogVisible" :title="webhookForm.id ? '编辑 Webhook' : '添加 Webhook'" width="520px">
      <el-form label-width="80px">
        <el-form-item label="URL">
          <el-input v-model="webhookForm.url" placeholder="https://example.com/hooks/wm" />
        </el-form-item>
        <el-form-item label="事件">
          <el-checkbox-group v-model="webhookForm.events">
            <el-checkbox
              v-for="opt in webhookEventOptions"
              :key="opt.value"
              :label="opt.value"
            >
              {{ opt.label }}
            </el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item v-if="webhookForm.id" label="启用">
          <el-switch v-model="webhookForm.isActive" />
        </el-form-item>
        <el-alert
          v-if="createdWebhookSecret"
          type="success"
          :closable="false"
          show-icon
          class="mb-2"
          title="请立即保存 Secret（仅显示一次）"
          :description="createdWebhookSecret"
        />
      </el-form>
      <template #footer>
        <el-button @click="webhookDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="webhookSaving" @click="saveWebhook">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessageBox } from "element-plus";
import {
  getOrganizationProfile,
  updateOrganizationProfile,
  type OrganizationProfile
} from "@/api/org/organization";
import {
  WEBHOOK_EVENT_OPTIONS,
  createOrgWebhook,
  deleteOrgWebhook,
  listOrgWebhooks,
  updateOrgWebhook,
  type OrgWebhookItem
} from "@/api/org/webhooks";
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
const canManageIntegration = computed(() => hasPerms("org:integration:manage"));

const webhooksLoading = ref(false);
const webhookSaving = ref(false);
const webhooks = ref<OrgWebhookItem[]>([]);
const webhookDialogVisible = ref(false);
const createdWebhookSecret = ref("");
const webhookEventOptions = WEBHOOK_EVENT_OPTIONS;
const webhookForm = reactive({
  id: "",
  url: "",
  events: [] as string[],
  isActive: true
});

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

function webhookEventLabel(value: string) {
  return webhookEventOptions.find((o) => o.value === value)?.label ?? value;
}

async function loadWebhooks() {
  if (!canManageIntegration.value) return;
  webhooksLoading.value = true;
  try {
    webhooks.value = await listOrgWebhooks();
  } finally {
    webhooksLoading.value = false;
  }
}

function openWebhookDialog(row?: OrgWebhookItem) {
  createdWebhookSecret.value = "";
  if (row) {
    webhookForm.id = row.id;
    webhookForm.url = row.url;
    webhookForm.events = [...row.events];
    webhookForm.isActive = row.isActive;
  } else {
    webhookForm.id = "";
    webhookForm.url = "";
    webhookForm.events = ["article.completed"];
    webhookForm.isActive = true;
  }
  webhookDialogVisible.value = true;
}

async function saveWebhook() {
  if (!webhookForm.url.trim() || webhookForm.events.length === 0) {
    message("请填写 URL 并选择至少一个事件", { type: "warning" });
    return;
  }
  webhookSaving.value = true;
  try {
    if (webhookForm.id) {
      await updateOrgWebhook(webhookForm.id, {
        url: webhookForm.url.trim(),
        events: webhookForm.events,
        isActive: webhookForm.isActive
      });
      message("Webhook 已更新", { type: "success" });
    } else {
      const created = await createOrgWebhook({
        url: webhookForm.url.trim(),
        events: webhookForm.events
      });
      createdWebhookSecret.value = created.secret ?? "";
      message("Webhook 已创建", { type: "success" });
    }
    await loadWebhooks();
    if (!createdWebhookSecret.value) {
      webhookDialogVisible.value = false;
    }
  } finally {
    webhookSaving.value = false;
  }
}

async function removeWebhook(id: string) {
  try {
    await ElMessageBox.confirm("确认删除该 Webhook？", "删除", { type: "warning" });
  } catch {
    return;
  }
  await deleteOrgWebhook(id);
  message("已删除", { type: "success" });
  await loadWebhooks();
}

onMounted(() => {
  void loadProfile();
  void loadWebhooks();
});
</script>
