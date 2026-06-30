<!--

  Console 访问控制：用户列表。

-->

<template>

  <el-card v-loading="loading" shadow="never">

    <template #header>

      <div class="flex flex-wrap items-center justify-between gap-2">

        <div class="flex flex-wrap items-center gap-3">

          <span class="font-medium">选择账号</span>

          <el-segmented

            :model-value="scope"

            :options="scopeOptions"

            @update:model-value="emit('update:scope', $event)"

          />

        </div>

        <div class="flex gap-2">

          <el-input

            :model-value="keyword"

            placeholder="搜索邮箱或姓名"

            clearable

            class="w-52"

            @update:model-value="emit('update:keyword', $event)"

            @keyup.enter="emit('search')"

          />

          <el-button @click="emit('search')">搜索</el-button>

        </div>

      </div>

    </template>



    <el-table :data="users" highlight-current-row stripe @current-change="emit('select', $event)">

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

      <el-table-column

        v-if="scope === 'tenant'"

        prop="organizationName"

        label="所属企业"

        min-width="160"

      />

    </el-table>



    <div class="mt-4 flex justify-end">

      <el-pagination

        :current-page="page"

        :page-size="limit"

        :total="total"

        :page-sizes="[20, 50]"

        layout="total, prev, pager, next"

        @current-change="emit('page-change', $event)"

      />

    </div>

  </el-card>

</template>



<script setup lang="ts">

import type { ConsoleUserItem } from "@/api/console/index";

import { memberRoleDict } from "@/constants/dicts/platform";

import { dictLabel, dictTagType } from "@/utils/dict";



defineOptions({ name: "ConsoleUserListPanel" });



defineProps<{

  loading: boolean;

  users: ConsoleUserItem[];

  page: number;

  limit: number;

  total: number;

  keyword: string;

  scope: "platform" | "tenant";

}>();



const scopeOptions = [

  { label: "平台运营", value: "platform" },

  { label: "租户账号（高级）", value: "tenant" }

];



const emit = defineEmits<{

  "update:keyword": [value: string];

  "update:scope": [value: "platform" | "tenant"];

  search: [];

  select: [user: ConsoleUserItem | undefined];

  "page-change": [page: number];

}>();

</script>


