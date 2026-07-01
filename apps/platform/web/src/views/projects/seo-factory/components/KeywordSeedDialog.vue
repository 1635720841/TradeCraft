<!--
  关键词池：AI 种子词生成与预览入库对话框。
-->
<template>
  <el-dialog
    :model-value="visible"
    :title="step === 'config' ? 'AI 生成种子词' : '挑选要加入的关键词'"
    width="820px"
    destroy-on-close
    class="keyword-seed-dialog"
    :class="{ 'is-preview': step === 'preview' }"
    @update:model-value="emit('update:visible', $event)"
    @closed="emit('closed')"
  >
    <template v-if="step === 'config'">
      <el-alert
        v-if="fromGsc"
        class="mb-4"
        type="success"
        :closable="false"
        show-icon
        title="已带入本站 Google 搜索词"
        description="AI 将围绕该站点真实搜索词扩展相关长尾选题；预览后勾选加入词库。"
      />
      <el-collapse class="mb-4">
        <el-collapse-item title="这个功能是做什么的？" name="principle">
          <div class="space-y-2 text-sm leading-relaxed text-gray-600">
            <p>
              <strong>种子词</strong>是内容规划的起点：AI 根据站点域名、品牌语气、目标市场和你填的「主题聚焦」，模拟 SEO 研究员头脑风暴，生成一批<strong>候选搜索词</strong>。
            </p>
            <p>
              每个候选词会附带<strong>搜索意图</strong>、<strong>商业价值</strong>与<strong>内容匹配度</strong>评估，用于后续「建议优先级」排序——并不是直接写文章。
            </p>
            <p>
              生成后你会在下一步<strong>勾选想要的词</strong>，确认后才写入关键词池；不合适的可以去掉，不会自动全部入库。
            </p>
            <p class="text-gray-500">推荐路径：生成并挑选 → 加入专题 → 按主题创建任务。</p>
          </div>
        </el-collapse-item>
      </el-collapse>
      <el-form label-width="100px">
        <el-form-item label="目标站点">
          <el-select
            v-model="form.siteId"
            class="w-full"
            placeholder="默认首个站点"
            clearable
            :loading="sitesLoading"
          >
            <el-option v-for="site in sites" :key="site.id" :label="site.domain" :value="site.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="生成数量">
          <el-input-number v-model="form.count" :min="5" :max="30" class="w-full" />
        </el-form-item>
        <el-form-item :label="fromGsc ? '搜索锚点' : '主题聚焦'">
          <el-input
            v-model="form.topicHint"
            type="textarea"
            :rows="3"
            maxlength="500"
            show-word-limit
            :placeholder="
              fromGsc
                ? '来自本站 Google 搜索数据，可微调后生成'
                : '可选，如：工业阀门、B2B 采购决策'
            "
          />
        </el-form-item>
      </el-form>
    </template>

    <div v-else class="keyword-seed-preview">
      <el-alert
        class="mb-4"
        type="info"
        :closable="false"
        show-icon
        title="请勾选要加入关键词池的词"
        description="已存在于池中的词会标记为「已有」，无法重复加入。确认后仅写入你勾选的项。"
      />
      <el-table
        ref="previewTableRef"
        class="keyword-seed-preview__table"
        :data="candidates"
        :max-height="380"
        stripe
        @selection-change="emit('selection-change', $event)"
      >
        <el-table-column type="selection" width="48" :selectable="isRowSelectable" />
        <el-table-column prop="keyword" label="关键词" min-width="220" show-overflow-tooltip />
        <el-table-column label="建议优先级" width="108">
          <template #default="{ row }">
            <el-tag :type="priorityTierTagType(seedPriorityScore(row))" size="small">
              {{ priorityTierLabel(seedPriorityScore(row)) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="intent" label="意图" width="110">
          <template #default="{ row }">
            <el-tag size="small" :type="dictTagType(keywordIntentDict, row.intent)">
              {{ dictLabel(keywordIntentDict, row.intent) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="rationale" label="推荐理由" min-width="280" show-overflow-tooltip />
        <el-table-column label="状态" width="72">
          <template #default="{ row }">
            <el-tag v-if="row.alreadyExists" size="small" type="info">已有</el-tag>
            <span v-else class="text-gray-400">—</span>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <template #footer>
      <template v-if="step === 'config'">
        <el-button @click="emit('update:visible', false)">取消</el-button>
        <el-button type="primary" :loading="generating" @click="emit('preview')">生成预览</el-button>
      </template>
      <template v-else>
        <el-button @click="emit('back')">返回修改</el-button>
        <el-button @click="emit('update:visible', false)">取消</el-button>
        <el-button
          type="primary"
          :loading="confirming"
          :disabled="selectedCount === 0"
          @click="emit('confirm')"
        >
          加入关键词池{{ selectedCount > 0 ? `（${selectedCount}）` : "" }}
        </el-button>
      </template>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from "vue";
import type { TableInstance } from "element-plus";
import type { KeywordSeedCandidate } from "@/api/seo-factory/keyword";
import type { SiteItem } from "@/api/seo-factory/types";
import { keywordIntentDict } from "@/constants/dicts/seo-factory";
import { dictLabel, dictTagType } from "@/utils/dict";
import {
  getKeywordPriorityTier,
  getKeywordPriorityTierLabel,
  getKeywordPriorityTierTagType
} from "@/utils/seo-factory/keyword-display";

defineOptions({ name: "KeywordSeedDialog" });

defineProps<{
  visible: boolean;
  step: "config" | "preview";
  fromGsc: boolean;
  sites: SiteItem[];
  sitesLoading: boolean;
  form: { siteId: string; count: number; topicHint: string };
  candidates: KeywordSeedCandidate[];
  generating: boolean;
  confirming: boolean;
  selectedCount: number;
}>();

const emit = defineEmits<{
  "update:visible": [value: boolean];
  closed: [];
  preview: [];
  confirm: [];
  back: [];
  "selection-change": [rows: KeywordSeedCandidate[]];
}>();

const previewTableRef = ref<TableInstance>();

function seedPriorityScore(row: { businessValueScore?: number; contentFitScore?: number }) {
  const raw = (row.businessValueScore ?? 0.5) * 0.5 + (row.contentFitScore ?? 0.5) * 0.5;
  return Math.round(raw * 1000) / 10;
}

function priorityTierLabel(score: number) {
  return getKeywordPriorityTierLabel(getKeywordPriorityTier(score));
}

function priorityTierTagType(score: number) {
  return getKeywordPriorityTierTagType(getKeywordPriorityTier(score));
}

function isRowSelectable(row: KeywordSeedCandidate) {
  return !row.alreadyExists;
}

defineExpose({ previewTableRef });
</script>
