<!--
  企业集成：钉钉/飞书机器人、出站 Webhook 与投递记录。
-->
<template>
  <div class="p-4 space-y-4">
    <el-alert
      v-if="!canManageIntegration"
      type="info"
      :closable="false"
      show-icon
      title="当前账号无集成管理权限"
      description="集成配置由企业管理员维护。如需开通钉钉/飞书或 Webhook，请联系企业管理员。"
    />
    <div v-if="!canManageIntegration" class="text-sm">
      <router-link to="/org/members" class="text-primary">查看企业成员与管理员 →</router-link>
    </div>

    <el-card v-if="canManageIntegration" v-loading="robotsLoading" shadow="never">
      <template #header>
        <div class="flex items-center justify-between">
          <span class="font-medium">钉钉 / 飞书机器人</span>
          <el-button type="primary" size="small" @click="openRobotDialog()">
            添加机器人
          </el-button>
        </div>
      </template>
      <p class="mb-4 text-sm text-gray-500">
        将关键事件推送到钉钉或飞书群机器人 Webhook。
      </p>
      <el-empty
        v-if="!robotsLoading && robotChannels.length === 0"
        description="暂无机器人通道"
      >
        <el-button type="primary" size="small" @click="openRobotDialog()">添加机器人</el-button>
      </el-empty>
      <el-table v-else :data="robotChannels" stripe>
        <el-table-column prop="channelType" label="类型" width="90">
          <template #default="{ row }">
            {{ robotChannelTypeLabel(row.channelType) }}
          </template>
        </el-table-column>
        <el-table-column prop="webhookUrl" label="Webhook URL" min-width="220" />
        <el-table-column prop="events" label="事件" min-width="160">
          <template #default="{ row }">
            <el-tag v-for="ev in row.events" :key="ev" class="mr-1 mb-1" size="small">
              {{ robotEventLabel(ev) }}
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
            <div class="hidden sm:inline-flex sm:items-center sm:gap-1">
              <el-button link type="primary" @click="openRobotDialog(robotRow(row))">编辑</el-button>
              <el-button link type="danger" @click="removeRobotChannel(robotRow(row).id)">删除</el-button>
            </div>
            <el-dropdown class="sm:hidden" trigger="click" @command="(cmd) => onRobotRowCommand(cmd, robotRow(row))">
              <el-button link type="primary">操作</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="edit">编辑</el-dropdown-item>
                  <el-dropdown-item command="delete" divided>删除</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
        </el-table-column>
      </el-table>
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
      <el-empty
        v-if="!webhooksLoading && webhooks.length === 0"
        description="暂无出站 Webhook"
      >
        <el-button type="primary" size="small" @click="openWebhookDialog()">添加 Webhook</el-button>
      </el-empty>
      <el-table v-else :data="webhooks" stripe>
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
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <div class="hidden sm:inline-flex sm:items-center sm:gap-1">
              <el-button link type="primary" @click="openWebhookDialog(webhookRow(row))">编辑</el-button>
              <el-button link type="primary" @click="openDeliveryDrawer(webhookRow(row))">投递记录</el-button>
              <el-button link type="danger" @click="removeWebhook(webhookRow(row).id)">删除</el-button>
            </div>
            <el-dropdown class="sm:hidden" trigger="click" @command="(cmd) => onWebhookRowCommand(cmd, webhookRow(row))">
              <el-button link type="primary">操作</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="edit">编辑</el-dropdown-item>
                  <el-dropdown-item command="deliveries">投递记录</el-dropdown-item>
                  <el-dropdown-item command="delete" divided>删除</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
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

    <el-dialog
      v-model="robotDialogVisible"
      :title="robotForm.id ? '编辑机器人' : '添加机器人'"
      width="520px"
    >
      <el-form label-width="100px">
        <el-form-item label="类型">
          <el-select v-model="robotForm.channelType" class="w-full">
            <el-option
              v-for="opt in robotChannelTypeOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="Webhook URL">
          <el-input v-model="robotForm.webhookUrl" placeholder="https://..." />
        </el-form-item>
        <el-form-item label="事件">
          <el-checkbox-group v-model="robotForm.events">
            <el-checkbox
              v-for="opt in robotEventOptions"
              :key="opt.value"
              :label="opt.value"
            >
              {{ opt.label }}
            </el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item v-if="robotForm.id" label="启用">
          <el-switch v-model="robotForm.isActive" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="robotDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="robotSaving" @click="saveRobotChannel">保存</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="deliveryDrawerVisible" title="Webhook 投递记录" size="640px">
      <el-table v-loading="deliveriesLoading" :data="deliveries" stripe>
        <el-table-column prop="event" label="事件" width="160">
          <template #default="{ row }">
            {{ webhookEventLabel(row.event) }}
          </template>
        </el-table-column>
        <el-table-column prop="success" label="结果" width="80">
          <template #default="{ row }">
            <el-tag :type="row.success ? 'success' : 'danger'" size="small">
              {{ row.success ? "成功" : "失败" }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="statusCode" label="HTTP" width="70" />
        <el-table-column prop="errorMessage" label="错误信息" min-width="140" show-overflow-tooltip />
        <el-table-column prop="createdAt" label="时间" width="170">
          <template #default="{ row }">
            {{ formatTime(row.createdAt) }}
          </template>
        </el-table-column>
      </el-table>
      <div class="mt-4 flex justify-end">
        <el-pagination
          v-model:current-page="deliveryPage"
          :page-size="deliveryLimit"
          :total="deliveryTotal"
          layout="total, prev, pager, next"
          @current-change="loadDeliveries"
        />
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import {
  WEBHOOK_EVENT_OPTIONS,
  createOrgWebhook,
  deleteOrgWebhook,
  listOrgWebhooks,
  listWebhookDeliveries,
  updateOrgWebhook,
  type OrgWebhookItem,
  type WebhookDeliveryLog
} from "@/api/org/webhooks";
import {
  ROBOT_CHANNEL_TYPE_OPTIONS,
  ROBOT_EVENT_OPTIONS,
  createOrgRobotChannel,
  deleteOrgRobotChannel,
  listOrgRobotChannels,
  updateOrgRobotChannel,
  type OrgRobotChannelItem
} from "@/api/org/robot-channels";
import { confirmDestructiveDelete } from "@/utils/confirm-destructive-delete";
import { hasPerms } from "@/utils/auth";
import { message } from "@/utils/message";
import { tableRow } from "@/utils/table-row";

defineOptions({ name: "OrgIntegrationsView" });

const canManageIntegration = computed(() => hasPerms("org:integration:manage"));

const robotsLoading = ref(false);
const robotSaving = ref(false);
const robotChannels = ref<OrgRobotChannelItem[]>([]);
const robotDialogVisible = ref(false);
const robotEventOptions = ROBOT_EVENT_OPTIONS;
const robotChannelTypeOptions = ROBOT_CHANNEL_TYPE_OPTIONS;
const robotForm = reactive({
  id: "",
  channelType: "dingtalk" as string,
  webhookUrl: "",
  events: [] as string[],
  isActive: true
});

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

const deliveryDrawerVisible = ref(false);
const deliveriesLoading = ref(false);
const deliveries = ref<WebhookDeliveryLog[]>([]);
const deliveryPage = ref(1);
const deliveryLimit = 20;
const deliveryTotal = ref(0);
const activeWebhookId = ref("");

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("zh-CN");
}

function robotEventLabel(value: string) {
  return robotEventOptions.find((o) => o.value === value)?.label ?? value;
}

function robotRow(row: unknown): OrgRobotChannelItem {
  return tableRow<OrgRobotChannelItem>(row);
}

function webhookRow(row: unknown): OrgWebhookItem {
  return tableRow<OrgWebhookItem>(row);
}

function onRobotRowCommand(command: string | number | object, row: OrgRobotChannelItem) {
  const cmd = String(command);
  if (cmd === "edit") openRobotDialog(row);
  else if (cmd === "delete") void removeRobotChannel(row.id);
}

function onWebhookRowCommand(command: string | number | object, row: OrgWebhookItem) {
  const cmd = String(command);
  if (cmd === "edit") openWebhookDialog(row);
  else if (cmd === "deliveries") void openDeliveryDrawer(row);
  else if (cmd === "delete") void removeWebhook(row.id);
}

function robotChannelTypeLabel(value: string) {
  return robotChannelTypeOptions.find((o) => o.value === value)?.label ?? value;
}

async function loadRobotChannels() {
  if (!canManageIntegration.value) return;
  robotsLoading.value = true;
  try {
    robotChannels.value = await listOrgRobotChannels();
  } finally {
    robotsLoading.value = false;
  }
}

function openRobotDialog(row?: OrgRobotChannelItem) {
  if (row) {
    robotForm.id = row.id;
    robotForm.channelType = row.channelType;
    robotForm.webhookUrl = row.webhookUrl;
    robotForm.events = [...row.events];
    robotForm.isActive = row.isActive;
  } else {
    robotForm.id = "";
    robotForm.channelType = "dingtalk";
    robotForm.webhookUrl = "";
    robotForm.events = ["brief_pending"];
    robotForm.isActive = true;
  }
  robotDialogVisible.value = true;
}

async function saveRobotChannel() {
  if (!robotForm.webhookUrl.trim() || robotForm.events.length === 0) {
    message("请填写 Webhook URL 并选择至少一个事件", { type: "warning" });
    return;
  }
  robotSaving.value = true;
  try {
    if (robotForm.id) {
      await updateOrgRobotChannel(robotForm.id, {
        channelType: robotForm.channelType,
        webhookUrl: robotForm.webhookUrl.trim(),
        events: robotForm.events,
        isActive: robotForm.isActive
      });
      message("机器人通道已更新", { type: "success" });
    } else {
      await createOrgRobotChannel({
        channelType: robotForm.channelType,
        webhookUrl: robotForm.webhookUrl.trim(),
        events: robotForm.events
      });
      message("机器人通道已创建", { type: "success" });
    }
    robotDialogVisible.value = false;
    await loadRobotChannels();
  } finally {
    robotSaving.value = false;
  }
}

async function removeRobotChannel(id: string) {
  await confirmDestructiveDelete({
    title: "删除机器人通道",
    description: "删除后该群将不再接收事件推送。",
    expectedText: "机器人"
  });
  await deleteOrgRobotChannel(id);
  message("已删除", { type: "success" });
  await loadRobotChannels();
}

function webhookEventLabel(value: string) {
  return webhookEventOptions.find((o) => o.value === value)?.label ?? value;
}

async function loadWebhooks() {
  if (!canManageIntegration.value) return;
  webhooksLoading.value = true;
  try {
    const result = await listOrgWebhooks();
    webhooks.value = result.items;
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

async function openDeliveryDrawer(row: OrgWebhookItem) {
  activeWebhookId.value = row.id;
  deliveryPage.value = 1;
  deliveryDrawerVisible.value = true;
  await loadDeliveries();
}

async function loadDeliveries() {
  if (!activeWebhookId.value) return;
  deliveriesLoading.value = true;
  try {
    const result = await listWebhookDeliveries(
      activeWebhookId.value,
      deliveryPage.value,
      deliveryLimit
    );
    deliveries.value = result.items;
    deliveryTotal.value = result.total;
  } finally {
    deliveriesLoading.value = false;
  }
}

async function removeWebhook(id: string) {
  await confirmDestructiveDelete({
    title: "删除 Webhook",
    description: "删除后订阅端点将停止接收事件。",
    expectedText: "Webhook"
  });
  await deleteOrgWebhook(id);
  message("已删除", { type: "success" });
  await loadWebhooks();
}

onMounted(() => {
  void loadWebhooks();
  void loadRobotChannels();
});
</script>
