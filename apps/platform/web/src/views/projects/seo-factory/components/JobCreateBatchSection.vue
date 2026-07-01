<!--
  创建任务页：网站抓取 / 批量关键词入队折叠区。
-->
<template>
  <el-collapse class="mt-4 max-w-2xl">
    <el-collapse-item title="更多创建方式（网站抓取）" name="batch">
      <el-form
        ref="batchFormRef"
        :model="batchForm"
        :rules="batchRules"
        label-width="100px"
        :class="{ 'pointer-events-none opacity-60': !canCreateJob }"
        @submit.prevent
      >
        <el-form-item label="目标网站" prop="siteId">
          <el-select
            v-model="batchForm.siteId"
            placeholder="选择站点"
            class="w-full"
            :loading="sitesLoading"
            @change="emit('batch-site-change')"
          >
            <el-option v-for="site in sites" :key="site.id" :label="site.domain" :value="site.id">
              <div class="py-0.5">
                <div>{{ site.domain }}</div>
                <div v-if="siteOptionSubline(site)" class="text-xs text-gray-400 leading-tight">
                  {{ siteOptionSubline(site) }}
                </div>
              </div>
            </el-option>
          </el-select>
          <p class="mt-1 text-xs text-gray-500">{{ siteFieldDescription(selectedBatchSite) }}</p>
        </el-form-item>

        <el-form-item label="输出语言">
          <el-select v-model="batchForm.contentLanguage" class="w-full">
            <el-option
              v-for="item in contentLanguageOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
          <p class="mt-1 text-xs text-gray-500">默认跟随站点，可手动覆盖。</p>
        </el-form-item>

        <el-form-item v-if="batchSerpPicker.showPicker" label="本篇优化市场">
          <el-select v-model="batchForm.serpCountry" class="w-full">
            <el-option
              v-for="item in batchSerpPicker.options"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
          <p class="mt-1 text-xs text-gray-500">
            批量任务将统一按所选国家分析 Google 搜索结果。
            <template v-if="batchSerpPicker.siteMarketsLabel">
              站点面向：{{ batchSerpPicker.siteMarketsLabel }}。
            </template>
          </p>
        </el-form-item>

        <el-form-item label="来源">
          <el-radio-group v-model="batchForm.source">
            <el-radio value="site-crawl">从网站自动抓取</el-radio>
            <el-radio value="keywords">手动输入列表</el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item v-if="batchForm.source === 'keywords'" label="关键词/URL" prop="keywordsText">
          <el-input
            v-model="batchForm.keywordsText"
            type="textarea"
            :rows="6"
            placeholder="每行一条关键词或文章 URL"
          />
        </el-form-item>

        <el-form-item v-else label="抓取预览">
          <div class="w-full">
            <el-button
              size="small"
              :loading="previewLoading"
              :disabled="!batchForm.siteId"
              @click="emit('load-preview')"
            >
              预览抓取结果
            </el-button>
            <div v-if="previewItems.length" class="mt-2 text-sm text-gray-600">
              预览到 {{ previewItems.length }} 篇，将按「运行条数」截取
            </div>
            <el-table
              v-if="previewItems.length"
              :data="previewItems.slice(0, 8)"
              size="small"
              class="mt-2"
              max-height="220"
            >
              <el-table-column prop="keyword" label="关键词" min-width="160" />
              <el-table-column prop="url" label="URL" min-width="220" show-overflow-tooltip />
            </el-table>
          </div>
        </el-form-item>

        <el-form-item label="运行条数">
          <el-input-number v-model="batchForm.limit" :min="1" :max="20" />
        </el-form-item>

        <el-collapse class="mb-2">
          <el-collapse-item title="更多选项" name="advanced">
            <el-form-item label="仅博客页">
              <el-switch v-model="batchForm.seoArticlesOnly" />
              <p class="mt-1 text-xs text-gray-500">开启后只抓取博客/资讯页；关闭会纳入更多页面。</p>
            </el-form-item>
          </el-collapse-item>
        </el-collapse>

        <el-alert
          v-if="!quotaCanConsume"
          class="mb-4"
          type="error"
          :closable="false"
          show-icon
          :title="quotaPreviewText"
        >
          <template #default>
            <router-link to="/org/billing">查看用量与续期</router-link>
          </template>
        </el-alert>
        <p v-else class="text-sm text-gray-500 mb-3">{{ quotaPreviewText }}</p>

        <el-form-item>
          <el-button
            type="primary"
            :loading="submitting"
            :disabled="sites.length === 0 || !canCreateJob || !quotaCanConsume"
            @click="emit('submit')"
          >
            批量提交
          </el-button>
        </el-form-item>
      </el-form>
    </el-collapse-item>
  </el-collapse>
</template>

<script setup lang="ts">
import { ref } from "vue";
import type { FormInstance, FormRules } from "element-plus";
import type { DiscoveredSeoArticle, SiteItem } from "@/api/seo-factory/types";
import { CONTENT_LANGUAGE_OPTIONS, type ContentLanguageCode, type SerpCountryCode } from "@/constants/dicts/seo-factory";
import { resolveJobSerpCountryPicker } from "@/utils/seo-factory/target-market";

type JobSerpCountryPicker = ReturnType<typeof resolveJobSerpCountryPicker>;

defineOptions({ name: "JobCreateBatchSection" });

export interface JobCreateBatchForm {
  siteId: string;
  source: "site-crawl" | "keywords";
  keywordsText: string;
  contentLanguage: ContentLanguageCode;
  serpCountry: SerpCountryCode;
  limit: number;
  seoArticlesOnly: boolean;
}

defineProps<{
  sites: SiteItem[];
  sitesLoading: boolean;
  canCreateJob: boolean;
  batchForm: JobCreateBatchForm;
  batchRules: FormRules;
  batchSerpPicker: JobSerpCountryPicker;
  selectedBatchSite?: SiteItem;
  previewLoading: boolean;
  previewItems: DiscoveredSeoArticle[];
  submitting: boolean;
  quotaCanConsume: boolean;
  quotaPreviewText: string;
  siteOptionSubline: (site: SiteItem) => string | undefined;
  siteFieldDescription: (site?: SiteItem) => string;
}>();

const emit = defineEmits<{
  submit: [];
  "load-preview": [];
  "batch-site-change": [];
}>();

const batchFormRef = ref<FormInstance>();
const contentLanguageOptions = CONTENT_LANGUAGE_OPTIONS;

defineExpose({ batchFormRef });
</script>
