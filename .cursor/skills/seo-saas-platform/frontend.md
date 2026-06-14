# 前端工程规范

## 技术栈

Vue3 `<script setup lang="ts">` · Vite · Pinia · Vue Router · Element Plus · UnoCSS/Tailwind

## 文案

- template **直接写中文**，不做国际化
- 复用 ≥3 次的文案可抽 `constants/`，非必须

## 字典与枚举

- 定义：`src/constants/dicts/<域>.ts`（与 Prisma enum 的 `value` 一致）
- 工具：`src/utils/dict.ts` → `dictLabel` / `dictTagType` / `dictOptions`
- 单一数据源：`[{ value, label, type? }]`，禁止 TEXT + OPTIONS + TAG 多份映射
- 页面禁止 `status === 'ACTIVE' ? '进行中' : ...`；用 `dictLabel(dict, status)`

```typescript
export const projectStatusDict = [
  { value: "ACTIVE", label: "进行中", type: "success" },
  { value: "ARCHIVED", label: "已归档", type: "info" }
] as const;
```

## 文件头与标签顺序（强制）

顺序：`<!-- docstring -->` → `<template>` → `<script setup>` → `<style>`

```vue
<!--
  项目列表页：展示企业下所有项目，支持创建与切换。

  边界：
  - 不负责：项目内部业务（由 project-type 插件页面处理）
-->
<template>
  ...
</template>

<script setup lang="ts">
...
</script>
```

## 技术底座

基于 **pure-admin-thin**（`apps/platform/web`）：Layout、登录、权限壳由模板提供；业务只增 `views/` + `api/` + `router/modules/`。

## 目录树

```
web/src/
├── router/modules/          platform.ts, seo-factory.ts（静态路由）
├── store/                   pure-admin 自带（少改）
├── utils/http/              axios 封装 + WM 错误适配
├── api/platform/            project.ts 等平台 API
├── api/seo-factory/         article-job.ts 等插件 API
├── composables/             use-pagination, seo-factory/
├── constants/dicts/         platform.ts, seo-factory.ts
├── utils/dict.ts            dictLabel, dictTagType
├── views/platform/          ProjectListView, BillingView
├── views/projects/seo-factory/  JobListView, JobCreateView, JobDetailView
└── layout/                  pure-admin 壳（勿改核心）
```

## 路由

```
/platform/projects
/projects/:projectId/seo-factory/jobs
/projects/:projectId/seo-factory/jobs/create
/projects/:projectId/seo-factory/jobs/:id
```

- 新路由：加 `router/modules/*.ts`，`meta.title` 直接写中文
- 根路由已挂 Layout，业务模块父级勿重复 `component: Layout`
- 登录暂 Mock；`/api/v1/*` 代理 NestJS

新增 project-type：加 views + api + router module，不改平台核心。

## 组件规范

**SFC 标签顺序（强制）：** `template` → `script setup` → `style`

```vue
<!--
  示例页：简短说明职责。
-->
<template>
  <h1>项目列表</h1>
</template>

<script setup lang="ts">
interface Props { projectId: string; readonly?: boolean; }
const props = withDefaults(defineProps<Props>(), { readonly: false });
const emit = defineEmits<{ submit: [id: string] }>();
</script>
```

| 规则 | 说明 |
|------|------|
| 标签顺序 | template → script → style；禁止 script 在前 |
| script setup only | 禁止 Options API |
| Props/Emits 类型化 | interface + defineProps |
| 组件 ≤200行 | 模板 ≤80行 |
| 禁止 v-html | 除非 DOMPurify |
| 基础组件 App 前缀 | AppModal, AppTable |

## API 层与错误

```typescript
// src/api/platform/project.ts
import { http } from "@/utils/http";

const res = await http.request<WmApiResponse<ProjectItem[]>>(
  "get",
  "/api/v1/platform/projects"
);
```

- 成功：`{ data, meta }`；失败：`{ error: { code, message } }`，拦截器 `ElMessage.error(message)`
- 组件内禁止 fetch/axios，统一走 `src/api/**/*.ts`
- 详细 SFC 写法见 `.cursor/rules/vue.mdc`

## 性能

- 路由懒加载；project-type 动态 import
- 轮询 onUnmounted 清理；computed 优先于 watch

## 代码量

.vue ≤250行 · .ts ≤300行 · composable ≤150行 · method ≤40行

## 禁止

- views/ 放非页面组件
- 跨 project-type import
- window.xxx 全局挂载
