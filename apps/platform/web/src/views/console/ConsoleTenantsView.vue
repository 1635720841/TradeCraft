<!--
  租户管理页：平台超管跨租户管理。
-->
<template>
  <div class="p-4 space-y-4">
    <el-card v-loading="loading" shadow="never">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="font-medium">租户列表</span>
          <div class="flex gap-2">
            <el-input
              v-model="keyword"
              placeholder="搜索企业名或邮箱"
              clearable
              class="w-52"
              @keyup.enter="search"
            />
            <el-button @click="search">搜索</el-button>
            <el-button v-if="canCreateTenant" type="primary" @click="openCreate">新建租户</el-button>
          </div>
        </div>
      </template>

      <el-table :data="tenants" stripe>
        <el-table-column prop="name" label="企业名称" min-width="160" />
        <el-table-column prop="planName" label="套餐" width="100">
          <template #default="{ row }">
            {{ dictLabel(planNameDict, row.planName) }}
          </template>
        </el-table-column>
        <el-table-column prop="subscriptionStatus" label="订阅" width="100">
          <template #default="{ row }">
            <el-tag :type="dictTagType(subscriptionStatusDict, row.subscriptionStatus)">
              {{ dictLabel(subscriptionStatusDict, row.subscriptionStatus) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="memberCount" label="成员" width="80" align="center" />
        <el-table-column prop="monthlyArticleQuota" label="月配额" width="90" align="right" />
        <el-table-column label="有效至" width="110">
          <template #default="{ row }">
            {{ formatPeriodEnd(row.currentPeriodEnd) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <router-link
              :to="`/console/tenants/${row.id}`"
              class="mr-2 text-primary text-sm"
            >
              详情
            </router-link>
            <el-button v-if="canManageTenant" type="primary" link @click="openEdit(row)">编辑</el-button>
            <el-button v-if="canManageTenant" type="primary" link @click="openTopUp(row)">加购</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="mt-4 flex justify-end">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="limit"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @current-change="fetchList"
          @size-change="onSizeChange"
        />
      </div>
    </el-card>

    <TenantEditDialog
      v-model:visible="editDialogVisible"
      :mode="editDialogMode"
      :tenant="editingTenant"
      :can-manage="canManageTenant"
      @success="fetchList"
    />

    <TenantTopUpDialog
      v-model:visible="topUpVisible"
      :organization-id="topUpOrgId"
      :tenant-name="topUpTenantName"
      @success="fetchList"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { listTenants, type TenantItem } from "@/api/console/index";
import { planNameDict, subscriptionStatusDict } from "@/constants/dicts/platform";
import { dictLabel, dictTagType } from "@/utils/dict";
import { hasPerms } from "@/utils/auth";
import { formatPeriodEnd } from "@/utils/period";
import TenantEditDialog from "./components/TenantEditDialog.vue";
import TenantTopUpDialog from "./components/TenantTopUpDialog.vue";

defineOptions({ name: "ConsoleTenantsView" });

const canCreateTenant = computed(() => hasPerms("console:tenant:create"));
const canManageTenant = computed(() => hasPerms("console:tenant:update"));

const loading = ref(false);
const tenants = ref<TenantItem[]>([]);
const page = ref(1);
const limit = ref(20);
const total = ref(0);
const keyword = ref("");

const editDialogVisible = ref(false);
const editDialogMode = ref<"create" | "edit">("edit");
const editingTenant = ref<TenantItem | null>(null);

const topUpVisible = ref(false);
const topUpOrgId = ref("");
const topUpTenantName = ref("");

async function fetchList() {
  loading.value = true;
  try {
    const result = await listTenants(page.value, limit.value, keyword.value.trim());
    tenants.value = result.items;
    total.value = result.pagination.total;
    page.value = result.pagination.page;
    limit.value = result.pagination.limit;
  } finally {
    loading.value = false;
  }
}

function search() {
  page.value = 1;
  void fetchList();
}

function onSizeChange() {
  page.value = 1;
  void fetchList();
}

function openCreate() {
  editDialogMode.value = "create";
  editingTenant.value = null;
  editDialogVisible.value = true;
}

function openEdit(row: TenantItem) {
  editDialogMode.value = "edit";
  editingTenant.value = row;
  editDialogVisible.value = true;
}

function openTopUp(row: TenantItem) {
  topUpOrgId.value = row.id;
  topUpTenantName.value = row.name;
  topUpVisible.value = true;
}

onMounted(() => {
  void fetchList();
});
</script>
