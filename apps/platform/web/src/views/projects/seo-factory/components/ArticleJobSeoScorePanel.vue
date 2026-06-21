<!--
  SEO 评分展示：Semrush 终检（权威）+ 本地预检。

  边界：
  - 不负责：评分计算（后端 seo-checker 模块）
-->
<template>
  <div>
    <el-alert
      v-if="manualCheckWarning"
      class="mb-4"
      type="warning"
      :closable="false"
      show-icon
      title="Semrush 终检未完成"
      :description="manualCheckWarning"
    />

    <el-alert
      v-if="failedStepLabel"
      class="mb-4"
      type="warning"
      :closable="false"
      show-icon
      :title="`任务失败于「${failedStepLabel}」步骤`"
      description="点「重新生成」将从该步骤继续，不会重头生成。"
    />

    <el-alert
      v-if="calibratedScoreGapHint"
      class="mb-4"
      type="info"
      :closable="false"
      show-icon
      title="规则分 ≠ 预测 Semrush"
      :description="calibratedScoreGapHint"
    />

    <el-alert
      v-if="contentScoreSummary"
      class="mb-4"
      :type="contentScoreSummary.passed ? 'success' : 'info'"
      :closable="false"
      show-icon
      :title="contentScoreSummary.title"
      :description="contentScoreSummary.description"
    />

    <el-alert
      v-if="localScoreStale || semrushScoreStale"
      class="mb-4"
      type="warning"
      :closable="false"
      show-icon
      title="评分已过期"
      description="稿件经手动编辑后，下方分数可能基于旧稿。请到「稿件正文」Tab 按发布清单重算本地 SEO 或重跑 Semrush。"
    />

    <el-alert
      v-if="hasData || canCheck"
      class="mb-4"
      :type="semrushSkipped ? 'success' : 'info'"
      :closable="false"
      show-icon
      :title="publishStandardTitle"
      :description="publishStandardDescription"
    />

    <div class="mb-4 flex flex-wrap items-center gap-2">
      <el-button
        type="primary"
        :loading="checking"
        :disabled="!canRunSemrushCheck || checking"
        @click="emit('run-semrush-check')"
      >
        Semrush 终检（当前文章）
      </el-button>
      <el-button v-if="checking" @click="emit('cancel-semrush-check')">
        取消 / 解除卡住
      </el-button>
      <el-button
        :disabled="!canRerunOptimization || rerunningOptimization"
        :loading="rerunningOptimization"
        @click="emit('rerun-optimization')"
      >
        重新优化评分
      </el-button>
      <el-button
        :disabled="!canRewrite || rewriting"
        :loading="rewriting"
        @click="emit('rewrite')"
      >
        AI 重写
      </el-button>
      <span v-if="!canCheck" class="text-sm text-gray-500">需先有初稿内容</span>
      <span v-else-if="semrushGateReason" class="text-sm text-amber-600">
        {{ semrushGateReason }}
      </span>
      <span v-else-if="checking && checkStale" class="text-sm text-amber-600">
        优化可能已中断（API 重启或队列卡住），请点「取消 / 解除卡住」后重试
      </span>
      <span v-else-if="checking && optimizingMessage" class="text-sm text-gray-500">
        {{ optimizingMessage }}
      </span>
      <span v-else-if="checking" class="text-sm text-gray-500">
        优化进行中，请稍候（本地 AI 优化 + Semrush 终检，约 5–20 分钟）…
      </span>
      <span v-else-if="rewriting" class="text-sm text-gray-500">AI 重写中，约 30–90 秒…</span>
      <span v-else-if="rewriteBlockedReason" class="text-sm text-amber-600">
        {{ rewriteBlockedReason }}
      </span>
    </div>

    <el-alert
      v-if="localBreakdownStale"
      class="mb-4"
      type="success"
      :closable="false"
      show-icon
      :title="`本地预检已通过（${localScore} 分）`"
      description="下方分项为优化过程中的快照；Semrush 终检完成后将同步最新明细。规则拆段后的正文已写回稿件。"
    />

    <el-alert
      v-if="localNearMiss"
      class="mb-4"
      type="warning"
      :closable="false"
      show-icon
      :title="localNearMissTitle"
      :description="localNearMissHint"
    />

    <el-alert
      v-if="semrushNearMiss"
      class="mb-4"
      type="warning"
      :closable="false"
      show-icon
      :title="`Semrush ${semrushScore} / 10，距 ${semrushPassThreshold} 还差 ${semrushPointsToGo} 分`"
      description="重新生成将从上次 Semrush 分数继续优化，不会重跑本地预检。"
    />

    <el-descriptions v-if="hasData" :column="2" border>
      <el-descriptions-item label="发布标准" :span="2">
        <template v-if="semrushSkipped">
          <el-tag type="success">本地预检 ≥ {{ localPassThreshold }} 分即可发布</el-tag>
          <span class="ml-2 text-sm text-gray-500">
            当前环境未启用 Semrush 终检，以本地预检为唯一权威门槛
          </span>
        </template>
        <template v-else>
          <span class="text-sm text-gray-700">
            <template v-if="localGateCalibrated">
              预测 Semrush ≥ {{ semrushPassThreshold }} 分（实验室对齐）→ RPA 终检 ≥ {{ semrushPassThreshold }} 分
            </template>
            <template v-else>
              本地预检 ≥ {{ localPassThreshold }} 分 → Semrush 终检 ≥ {{ semrushPassThreshold }} 分
            </template>
          </span>
        </template>
      </el-descriptions-item>
      <el-descriptions-item label="Semrush 终检">
        <template v-if="semrushSkipped">
          <span class="text-gray-500">未启用（SEMRUSH_ENABLED）</span>
        </template>
        <template v-else-if="semrushScore != null">
          <el-tag :type="semrushTagType">{{ semrushScore }} / 10</el-tag>
          <el-tag v-if="semrushScoreStale" class="ml-2" type="warning" size="small" effect="plain">
            已过期
          </el-tag>
          <span class="ml-2 text-sm text-gray-500">
            通过线 {{ semrushPassThreshold }}（权威分）
          </span>
        </template>
        <span v-else>-</span>
      </el-descriptions-item>
      <el-descriptions-item :label="localGateCalibrated ? '预测 Semrush（本地闸）' : '本地预检'">
        <template v-if="localGateCalibrated && predictedLocalSemrush != null">
          <el-tag :type="localPassed === true ? 'success' : localPassed === false ? 'warning' : 'info'">
            {{ predictedLocalSemrush }} / 10
          </el-tag>
          <span class="ml-2 text-sm text-gray-500">进门闸 {{ semrushPassThreshold }} · 规则分 {{ localScore ?? "—" }}/100</span>
        </template>
        <template v-else>
          <el-tag :type="localTagType">{{ localScore ?? "-" }} / 100</el-tag>
        </template>
        <el-tag v-if="localScoreStale" class="ml-2" type="warning" size="small" effect="plain">
          已过期
        </el-tag>
        <el-tag
          v-if="localGateDisplayPassed === true"
          class="ml-2"
          type="success"
          size="small"
          effect="plain"
        >
          {{ localGatePassedLabel }}
        </el-tag>
        <el-tag
          v-else-if="localGateDisplayPassed === false"
          class="ml-2"
          type="warning"
          size="small"
          effect="plain"
        >
          未通过
        </el-tag>
        <span v-if="localScore != null && !localGateCalibrated" class="ml-2 text-sm text-gray-500">
          门槛 {{ localPassThreshold }} 分
        </span>
      </el-descriptions-item>
      <el-descriptions-item
        v-if="semrushReadabilityScore != null"
        label="Semrush 可读性"
      >
        {{ semrushReadabilityScore }} / 100
        <span class="ml-2 text-sm text-gray-500">目标约 50（±8）</span>
      </el-descriptions-item>
      <el-descriptions-item
        v-if="metrics?.fleschReadingEase != null"
        label="本地 Flesch"
      >
        {{ metrics.fleschReadingEase }} / 100
        <span class="ml-2 text-sm text-gray-500">
          目标 {{ metrics.fleschTarget ?? 50 }}（±8）
        </span>
      </el-descriptions-item>
      <el-descriptions-item
        v-if="metrics?.casualSentenceHits != null"
        label="本地语气（随意句）"
      >
        <span :class="readabilityMetricClass(metrics.casualSentenceHits, 3)">
          {{ metrics.casualSentenceHits }} / ≤3
        </span>
        <span class="ml-2 text-sm text-gray-500">>5 需改写</span>
      </el-descriptions-item>
      <el-descriptions-item
        v-if="semrushWordCountLabel"
        label="Semrush 词数"
      >
        {{ semrushWordCountLabel }}
      </el-descriptions-item>
      <el-descriptions-item v-if="semrushWordGap != null" label="Semrush 词数差">
        <span :class="semrushWordGapClass">
          {{ semrushWordGap > 0 ? `缺 ${semrushWordGap} 词` : `超 ${Math.abs(semrushWordGap)} 词` }}
        </span>
        <span class="ml-2 text-sm text-gray-500">优先补齐到竞品附近</span>
      </el-descriptions-item>
      <el-descriptions-item v-if="submittedKeywords.length" label="提交关键词" :span="2">
        <el-tag
          v-for="kw in submittedKeywords"
          :key="kw"
          class="mr-1 mb-1"
          size="small"
        >
          {{ kw }}
        </el-tag>
      </el-descriptions-item>
      <el-descriptions-item v-if="semrushNode" label="3ue 节点">
        {{ semrushNode }}
      </el-descriptions-item>
      <el-descriptions-item
        v-if="semrushEvaluationRoute"
        label="Semrush 评测线路"
      >
        {{ semrushEvaluationRoute }}
      </el-descriptions-item>
      <el-descriptions-item
        v-if="semrushEvaluationContentFingerprint"
        label="Semrush 评测文章"
        :span="2"
      >
        {{ semrushEvaluationContentFingerprint }}
      </el-descriptions-item>
      <el-descriptions-item v-if="analysisSource" label="建议来源">
        {{ analysisSourceLabel }}
      </el-descriptions-item>
      <el-descriptions-item v-if="optimizeRounds != null" label="本地优化轮次">
        {{ optimizeRounds }}
      </el-descriptions-item>
      <el-descriptions-item v-if="semrushOptimizeRounds != null" label="Semrush 优化轮次">
        {{ semrushOptimizeRounds }}
      </el-descriptions-item>
      <el-descriptions-item v-if="metrics?.wordCount" label="词数">
        {{ metrics.wordCount }}
      </el-descriptions-item>
      <el-descriptions-item v-if="metrics?.keywordDensity != null" label="关键词密度">
        {{ metrics.keywordDensity }}%
      </el-descriptions-item>
      <el-descriptions-item v-if="metrics" label="搜索词对齐">
        {{ metrics.matchedSerpTerms }} / {{ metrics.totalSerpTerms }}
      </el-descriptions-item>
      <el-descriptions-item
        v-if="metrics?.longSentencesOver22 != null"
        label="超长句 (>22词)"
      >
        <span :class="readabilityMetricClass(metrics.longSentencesOver22, 2)">
          {{ metrics.longSentencesOver22 }} / ≤2
        </span>
      </el-descriptions-item>
      <el-descriptions-item
        v-if="metrics?.longParagraphsOver65 != null"
        label="超长段 (>65词)"
      >
        <span :class="readabilityMetricClass(metrics.longParagraphsOver65, 1)">
          {{ metrics.longParagraphsOver65 }} / ≤1
        </span>
      </el-descriptions-item>
      <el-descriptions-item
        v-if="metrics?.passiveVoiceHits != null"
        label="被动语态"
      >
        <span :class="readabilityMetricClass(metrics.passiveVoiceHits, 6)">
          {{ metrics.passiveVoiceHits }} / ≤6
        </span>
      </el-descriptions-item>
      <el-descriptions-item
        v-if="metrics?.semrushComplexWordHits != null"
        label="本地复杂词"
      >
        <span :class="readabilityMetricClass(metrics.semrushComplexWordHits, 0)">
          {{ metrics.semrushComplexWordHits }} 处
        </span>
      </el-descriptions-item>
      <el-descriptions-item
        v-if="metrics?.hardToReadSentenceHits != null"
        label="本地难读句"
      >
        <span :class="readabilityMetricClass(metrics.hardToReadSentenceHits, 2)">
          {{ metrics.hardToReadSentenceHits }} / ≤2
        </span>
      </el-descriptions-item>
      <el-descriptions-item v-if="semrushCheckRecordLabel" label="检测包" :span="2">
        {{ semrushCheckRecordLabel }}
      </el-descriptions-item>
    </el-descriptions>

    <div v-if="breakdown" class="mt-4">
      <div class="mb-2 font-medium">本地预检明细（规则对齐 Semrush）</div>
      <el-row :gutter="12">
        <el-col v-for="item in breakdownItems" :key="item.key" :span="breakdownItems.length <= 4 ? 6 : 4">
          <el-card shadow="never" class="text-center">
            <div class="text-2xl font-semibold" :class="breakdownValueClass(item)">
              {{ item.value }}<span class="text-sm text-gray-400">/{{ item.max }}</span>
            </div>
            <div class="text-xs text-gray-500 mt-1">{{ item.label }}</div>
            <div v-if="item.gap > 0" class="text-xs text-amber-600 mt-0.5">−{{ item.gap }}</div>
          </el-card>
        </el-col>
      </el-row>
    </div>

    <div v-if="longParagraphSamples.length" class="mt-4">
      <div class="mb-2 font-medium">
        超长段定位（须压至 ≤1 段，每段 ≤65 词）
      </div>
      <el-alert
        class="mb-3"
        type="warning"
        :closable="false"
        show-icon
        title="优先拆分以下段落"
        description="在「稿件正文」Tab 按空行拆段后保存，或点「重新优化评分」由系统自动拆分。"
      />
      <ul class="space-y-2 text-sm">
        <li
          v-for="(sample, i) in longParagraphSamples"
          :key="`p-${i}`"
          class="rounded border border-red-200 bg-red-50 px-3 py-2"
        >
          <span class="text-red-700 font-medium">{{ sample.wordCount }} 词 · </span>
          <span class="text-gray-800 line-clamp-3">{{ sample.text }}</span>
        </li>
      </ul>
    </div>

    <div v-if="longSentenceSamples.length" class="mt-4">
      <div class="mb-2 font-medium">
        超长句定位（须压至 ≤2 条，每条 ≤22 词）
      </div>
      <el-alert
        class="mb-3"
        type="warning"
        :closable="false"
        show-icon
        title="优先修复以下句子"
        description="在「稿件正文」Tab 拆句或删填充词后保存，系统将自动重算本地预检分。重新生成也会自动规则拆句。"
      />
      <ul class="space-y-2 text-sm">
        <li
          v-for="(sample, i) in longSentenceSamples"
          :key="i"
          class="rounded border border-amber-200 bg-amber-50 px-3 py-2"
        >
          <span class="text-amber-700 font-medium">{{ sample.wordCount }} 词 · </span>
          <span class="text-gray-800">{{ sample.text }}</span>
        </li>
      </ul>
    </div>

    <div v-if="semrushComplexWordSamples.length" class="mt-4">
      <div class="mb-2 font-medium">复杂词定位（Semrush 侧栏对齐）</div>
      <ul class="space-y-2 text-sm">
        <li
          v-for="(sample, i) in semrushComplexWordSamples"
          :key="`cw-${i}`"
          class="rounded border border-amber-200 bg-amber-50 px-3 py-2"
        >
          <span class="text-amber-700 font-medium">{{ sample.term }}</span>
          <span class="text-gray-600"> → {{ sample.suggestion }}</span>
        </li>
      </ul>
    </div>

    <div v-if="hardToReadSentenceSamples.length" class="mt-4">
      <div class="mb-2 font-medium">难读句定位（Semrush「重写难以阅读的句子」对齐）</div>
      <ul class="space-y-2 text-sm">
        <li
          v-for="(sample, i) in hardToReadSentenceSamples"
          :key="`hr-${i}`"
          class="rounded border border-red-200 bg-red-50 px-3 py-2"
        >
          <span class="text-red-700 font-medium">{{ sample.wordCount }} 词 · </span>
          <span class="text-gray-800">{{ sample.text }}</span>
        </li>
      </ul>
    </div>

    <div v-if="casualSentenceSamples.length" class="mt-4">
      <div class="mb-2 font-medium">
        随意句定位（建议 ≤3 条，>5 条会明显拖累 Semrush 语气）
      </div>
      <el-alert
        class="mb-3"
        type="warning"
        :closable="false"
        show-icon
        title="优先改写以下句子为 B2B 正式陈述句"
        description="将问句（Which/Can users...）改为陈述句；将 Next/comes next 这类口语过渡改为正式衔接。"
      />
      <ul class="space-y-2 text-sm">
        <li
          v-for="(sample, i) in casualSentenceSamples"
          :key="`c-${i}`"
          class="rounded border border-amber-200 bg-amber-50 px-3 py-2"
        >
          <span class="text-amber-700 font-medium">({{ sample.reason }}) </span>
          <span class="text-gray-800">{{ sample.text }}</span>
        </li>
      </ul>
    </div>

    <div v-if="localSuggestions.length" class="mt-4">
      <div class="mb-2 font-medium">本地评分建议</div>
      <ul class="list-disc pl-5 space-y-1 text-sm">
        <li v-for="(s, i) in localSuggestions" :key="i">{{ s }}</li>
      </ul>
    </div>

    <div v-if="semrushSuggestionSections.length" class="mt-4">
      <div class="mb-2 font-medium">Semrush 建议</div>
      <div
        v-for="section in semrushSuggestionSections"
        :key="section.key"
        class="mb-3"
      >
        <div class="text-sm font-medium text-gray-700">{{ section.label }}</div>
        <ul class="list-disc pl-5 space-y-1 text-sm mt-1">
          <li v-for="(s, i) in section.items" :key="i">{{ s }}</li>
        </ul>
      </div>
    </div>
    <div v-else-if="semrushSuggestions.length" class="mt-4">
      <div class="mb-2 font-medium">Semrush 建议</div>
      <ul class="list-disc pl-5 space-y-1 text-sm">
        <li v-for="(s, i) in semrushSuggestions" :key="i">{{ s }}</li>
      </ul>
    </div>

    <div v-if="optimizeScoreRows.length" class="mt-4">
      <div class="mb-2 font-medium">优化轮次评分</div>
      <el-table :data="optimizeScoreRows" size="small" border stripe>
        <el-table-column label="阶段" width="100">
          <template #default="{ row }">
            <el-tag :type="phaseTagType(row.phase)" size="small">
              {{ phaseLabel(row.phase) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="轮次" width="88" prop="roundLabel" />
        <el-table-column label="3ue 节点" min-width="220">
          <template #default="{ row }">
            <span v-if="row.phase === 'semrush'">
              <el-tag
                v-if="row.semrushRouteChanged"
                class="mr-2"
                type="warning"
                size="small"
                effect="plain"
              >
                线路变更
              </el-tag>
              {{ row.semrushEvaluationRoute || semrushEvaluationRoute || semrushNode || "-" }}
            </span>
            <span v-else class="text-gray-400">-</span>
          </template>
        </el-table-column>
        <el-table-column label="优化前" width="100">
          <template #default="{ row }">
            {{ formatRowScore(row, "before") }}
          </template>
        </el-table-column>
        <el-table-column label="优化后" width="100">
          <template #default="{ row }">
            <span :class="scoreDeltaClass(getRowDelta(row))">
              {{ formatRowScore(row, "after") }}
            </span>
          </template>
        </el-table-column>
        <el-table-column v-if="showPredictedOptimizeScores" label="预测前" width="88">
          <template #default="{ row }">
            {{ formatRowPredictedScore(row, "before") }}
          </template>
        </el-table-column>
        <el-table-column v-if="showPredictedOptimizeScores" label="预测后" width="88">
          <template #default="{ row }">
            <span :class="scoreDeltaClass(getRowPredictedDelta(row))">
              {{ formatRowPredictedScore(row, "after") }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="候选分" width="100">
          <template #default="{ row }">
            <span v-if="row.rolledBack && row.candidateScoreAfter != null" class="text-amber-600">
              {{ formatRoundScore(row.candidateScoreAfter, row.phase) }}
            </span>
            <span v-else class="text-gray-400">-</span>
          </template>
        </el-table-column>
        <el-table-column v-if="showPredictedOptimizeScores" label="预测候选" width="88">
          <template #default="{ row }">
            <span
              v-if="row.rolledBack && row.candidatePredictedSemrush != null"
              class="text-amber-600"
            >
              {{ formatPredictedSemrush(row.candidatePredictedSemrush) }}
            </span>
            <span v-else class="text-gray-400">-</span>
          </template>
        </el-table-column>
        <el-table-column label="回滚" min-width="160">
          <template #default="{ row }">
            <template v-if="row.rolledBack">
              <el-tag type="warning" size="small" effect="plain">
                已回滚
              </el-tag>
              <div class="text-xs text-gray-500 mt-0.5">
                {{ formatRollbackReason(asOptimizeRow(row)) }}
              </div>
            </template>
            <span v-else class="text-gray-400">-</span>
          </template>
        </el-table-column>
        <el-table-column label="变化" width="88">
          <template #default="{ row }">
            <div v-if="getRowDelta(row) != null" :class="scoreDeltaClass(getRowDelta(row))">
              {{ formatDelta(getRowDelta(row)!) }}
            </div>
            <div
              v-if="showPredictedOptimizeScores && getRowPredictedDelta(row) != null"
              class="text-xs"
              :class="scoreDeltaClass(getRowPredictedDelta(row))"
            >
              预测 {{ formatDelta(getRowPredictedDelta(row)!) }}
            </div>
            <span
              v-if="getRowDelta(row) == null && getRowPredictedDelta(row) == null"
              class="text-gray-400"
            >
              -
            </span>
          </template>
        </el-table-column>
        <el-table-column label="本地分" width="120">
          <template #default="{ row }">
            <span v-if="formatRowLocalScoreDetail(row)">{{ formatRowLocalScoreDetail(row) }}</span>
            <span v-else class="text-gray-400">-</span>
          </template>
        </el-table-column>
        <el-table-column label="时间" min-width="140">
          <template #default="{ row }">
            <span class="text-xs text-gray-500">{{ formatRowTime(row) }}</span>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <div v-if="optimizeHistory.length" class="mt-4">
      <div class="mb-2 font-medium">AI 优化记录</div>
      <el-collapse v-model="activeOptimizePanels">
        <el-collapse-item
          v-for="item in optimizeHistory"
          :key="`${item.phase}-${item.round}-${item.optimizedAt}`"
          :name="`${item.phase}-${item.round}-${item.optimizedAt}`"
        >
          <template #title>
            <div class="flex flex-wrap items-center gap-2 pr-2">
              <el-tag :type="phaseTagType(item.phase)" size="small">
                {{ phaseLabel(item.phase) }}
              </el-tag>
              <span class="text-sm">
                {{ item.kind === "baseline" || item.round === 0
                  ? (item.phase === "local" ? "初稿" : "Semrush 初检")
                  : `第 ${item.round} 轮` }}
              </span>
              <el-tag
                v-if="item.scoreBefore != null || item.scoreAfter != null"
                size="small"
                effect="plain"
              >
                {{ formatRoundScore(item.scoreBefore, item.phase) }}
                →
                {{ formatRoundScore(item.scoreAfter, item.phase) }}
              </el-tag>
              <el-tag
                v-if="formatOptimizePredictedSummary(item)"
                size="small"
                effect="plain"
                type="info"
              >
                预测 {{ formatOptimizePredictedSummary(item) }}
              </el-tag>
              <el-tag
                v-if="item.rolledBack"
                type="warning"
                size="small"
                effect="plain"
              >
                已回滚
              </el-tag>
              <span
                v-if="item.rolledBack && item.candidateScoreAfter != null"
                class="text-xs text-amber-600"
              >
                候选 {{ formatRoundScore(item.candidateScoreAfter, item.phase) }}
                → 保留 {{ formatRoundScore(item.scoreAfter, item.phase) }}
              </span>
              <span
                v-if="item.rolledBack && item.candidatePredictedSemrush != null"
                class="text-xs text-amber-600"
              >
                预测候选 {{ formatPredictedSemrush(item.candidatePredictedSemrush) }}
                → 保留 {{ formatPredictedSemrush(item.predictedSemrushAfter) }}
              </span>
              <span v-if="item.promptVersion" class="text-xs text-gray-500">
                {{ item.promptVersion }}
              </span>
              <span class="text-xs text-gray-400">{{ formatTime(item.optimizedAt) }}</span>
              <el-tag
                v-if="item.warnings?.length"
                type="warning"
                size="small"
                effect="plain"
              >
                {{ item.warnings.length }} 条未落实
              </el-tag>
            </div>
          </template>

          <div v-if="item.rolledBack" class="mb-3">
            <div class="text-sm font-medium text-gray-700 mb-1">回滚说明</div>
            <p class="text-sm text-gray-600">{{ formatRollbackDetail(item) }}</p>
          </div>

          <div v-if="item.breakdownAfter" class="mb-3">
            <div class="text-sm font-medium text-gray-700 mb-1">评分明细（优化后）</div>
            <div class="flex flex-wrap gap-2 text-xs">
              <el-tag size="small" type="info">关键词 {{ item.breakdownAfter.keywordCoverage }}</el-tag>
              <el-tag size="small" type="info">搜索词 {{ item.breakdownAfter.serpTermAlignment }}</el-tag>
              <el-tag size="small" type="info">结构 {{ item.breakdownAfter.structure }}</el-tag>
              <el-tag size="small" type="info">可读 {{ item.breakdownAfter.readability }}</el-tag>
              <el-tag size="small" type="info">深度 {{ item.breakdownAfter.contentDepth }}</el-tag>
            </div>
          </div>

          <div v-if="item.changesSummary?.length" class="mb-3">
            <div class="text-sm font-medium text-gray-700 mb-1">已落实</div>
            <ul class="list-disc pl-5 space-y-1 text-sm">
              <li v-for="(line, i) in item.changesSummary" :key="i">{{ line }}</li>
            </ul>
          </div>

          <div v-if="item.warnings?.length">
            <div class="text-sm font-medium text-amber-700 mb-1">未落实 / 注意</div>
            <ul class="list-disc pl-5 space-y-1 text-sm text-amber-800">
              <li v-for="(line, i) in item.warnings" :key="i">{{ line }}</li>
            </ul>
          </div>

          <p
            v-if="!item.changesSummary?.length && !item.warnings?.length"
            class="text-sm text-gray-500"
          >
            本轮未返回变更说明
          </p>
        </el-collapse-item>
      </el-collapse>
    </div>

    <ArticleJobSeoAnalysisSnapshotsPanel :snapshots="analysisSnapshots" />

    <el-empty
      v-if="!hasData && !canCheck"
      description="暂无 SEO 评分（任务尚未进入优化阶段）"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type {
  ArticleJobOptimizeRound,
  ArticleJobSeoCheckData
} from "@/api/seo-factory/types";
import {
  LOCAL_SEO_PASS_THRESHOLD,
  SEMRUSH_PASS_THRESHOLD,
  SCORE_CALIBRATION_LOCAL_ALIGN_SOFT_PASS_MARGIN,
  SCORE_CALIBRATION_HIGH_LOCAL_SOFT_PASS_MARGIN
} from "@/constants/seo-factory";
import { workflowStepLabel } from "@/utils/seo-factory/workflow-progress";
import ArticleJobSeoAnalysisSnapshotsPanel from "./seo/ArticleJobSeoAnalysisSnapshotsPanel.vue";

defineOptions({ name: "ArticleJobSeoScorePanel" });

const props = defineProps<{
  localSeoScore?: number | null;
  semrushScore?: number | null;
  seoCheckData?: ArticleJobSeoCheckData | null;
  optimizeHistory?: ArticleJobOptimizeRound[] | null;
  localScoreStale?: boolean;
  semrushScoreStale?: boolean;
  canCheck?: boolean;
  checking?: boolean;
  checkStale?: boolean;
  optimizingMessage?: string;
  canRewrite?: boolean;
  rewriting?: boolean;
  rewriteBlockedReason?: string;
  canRerunOptimization?: boolean;
  rerunningOptimization?: boolean;
  localPassThreshold?: number;
  semrushPassThreshold?: number;
  /** 站点已开启本地对齐 Sem（实际生效见 seoCheck.local.gateMode） */
  localAlignEnabled?: boolean;
}>();

const localPassThreshold = computed(
  () => props.localPassThreshold ?? LOCAL_SEO_PASS_THRESHOLD
);
const semrushPassThreshold = computed(
  () => props.semrushPassThreshold ?? SEMRUSH_PASS_THRESHOLD
);

const emit = defineEmits<{
  "run-semrush-check": [];
  "cancel-semrush-check": [];
  rewrite: [];
  "rerun-optimization": [];
}>();

const local = computed(() => props.seoCheckData?.local);
const semrush = computed(() => props.seoCheckData?.semrush);
const contentScore = computed(() => props.seoCheckData?.contentScore);
const analysisSnapshots = computed(() => props.seoCheckData?.analysisSnapshots ?? []);
const manualCheckWarning = computed(() => semrush.value?.lastManualCheckError?.trim() || null);
const workflowProgress = computed(() => props.seoCheckData?.workflowProgress);

const failedStepLabel = computed(() => {
  const step = props.seoCheckData?.workflow?.failedStep;
  return step ? workflowStepLabel(step) : null;
});

const localScore = computed(() => {
  const candidates = [
    props.localSeoScore,
    local.value?.score,
    workflowProgress.value?.localScore,
  ].filter((v): v is number => typeof v === "number");
  if (candidates.length === 0) return null;
  return Math.max(...candidates);
});

const contentScoreSummary = computed(() => {
  const snap = contentScore.value;
  if (!snap) return null;
  const sourceLabel =
    snap.source === "draft_editor"
      ? "改稿评分"
      : snap.source === "m6_proxy"
        ? "M6 代理分"
        : "流水线评分";
  return {
    passed: snap.passed,
    title: `内容评分 ${snap.overall} / 10（${sourceLabel}）`,
    description: snap.passed
      ? `已达发布线 · ${snap.primaryNode.label} · ${snap.confidence} 置信`
      : `还差 ${snap.pointsToGo} 分 · 当前重点：${snap.primaryNode.label}`
  };
});

const localGateCalibrated = computed(
  () =>
    local.value?.gateMode === "calibrated" ||
    (props.localAlignEnabled === true && contentScore.value != null)
);
const predictedLocalSemrush = computed(() => {
  if (local.value?.predictedSemrush != null) return local.value.predictedSemrush;
  if (localGateCalibrated.value && contentScore.value?.overall != null) {
    return contentScore.value.overall;
  }
  return null;
});
const localBreakdownStale = computed(() => {
  const score = localScore.value;
  const persisted = local.value?.score;
  if (score == null || persisted == null) return false;
  return score >= localPassThreshold.value && score > persisted;
});
const localPassed = computed(() => {
  if (localGateCalibrated.value && predictedLocalSemrush.value != null) {
    return predictedLocalSemrush.value >= semrushPassThreshold.value;
  }
  if (localScore.value != null) {
    return localScore.value >= localPassThreshold.value;
  }
  if (local.value?.passed != null) return local.value.passed;
  return null;
});
const localPassedForSemrush = computed(() => {
  if (localGateCalibrated.value && predictedLocalSemrush.value != null) {
    if (predictedLocalSemrush.value >= semrushPassThreshold.value) return true;
    if (
      predictedLocalSemrush.value >=
      semrushPassThreshold.value - SCORE_CALIBRATION_LOCAL_ALIGN_SOFT_PASS_MARGIN
    ) {
      return true;
    }
    if (
      (localScore.value ?? 0) >= localPassThreshold.value &&
      predictedLocalSemrush.value >=
        semrushPassThreshold.value - SCORE_CALIBRATION_HIGH_LOCAL_SOFT_PASS_MARGIN
    ) {
      return true;
    }
  }
  return localPassed.value;
});
const localGateDisplayPassed = computed(() => {
  if (localGateCalibrated.value && predictedLocalSemrush.value != null) {
    return localPassedForSemrush.value;
  }
  return localPassed.value;
});
const localGatePassedLabel = computed(() => {
  if (
    localGateCalibrated.value &&
    predictedLocalSemrush.value != null &&
    predictedLocalSemrush.value < semrushPassThreshold.value &&
    localPassedForSemrush.value
  ) {
    return "可进 RPA（软放行）";
  }
  return "已通过";
});
const calibratedScoreGapHint = computed(() => {
  if (!localGateCalibrated.value || predictedLocalSemrush.value == null || localScore.value == null) {
    return "";
  }
  if (localScore.value < 90 || predictedLocalSemrush.value >= semrushPassThreshold.value) {
    return "";
  }
  const parts = [
    `规则分 ${localScore.value}/100 与预测 Semrush ${predictedLocalSemrush.value}/10 是两套评分，进门闸只看预测分（实验室校准模型），不是规则分÷10。`
  ];
  const flesch = metrics.value?.fleschReadingEase;
  if (flesch != null && flesch < 42) {
    parts.push(`Flesch ${flesch} 低于 Sem 目标 50±8，是预测分长期卡在 9 以下的主因；优化轮次以提升预测分为验收，规则分 99 仍可能回滚。`);
  } else if (localPointsToGo.value > 0) {
    parts.push(`还差 ${localPointsToGo.value} 分达标；规则分已满时，请优先 Flesch / 难读句 / SERP 实体。`);
  }
  return parts.join("");
});
const localPointsToGo = computed(() => {
  if (localGateCalibrated.value && predictedLocalSemrush.value != null) {
    if (predictedLocalSemrush.value >= semrushPassThreshold.value) return 0;
    return Math.round((semrushPassThreshold.value - predictedLocalSemrush.value) * 10) / 10;
  }
  if (localScore.value == null || localScore.value >= localPassThreshold.value) return 0;
  return localPassThreshold.value - localScore.value;
});

const localNearMiss = computed(() => {
  if (localPassed.value === true) return false;
  if (localGateCalibrated.value && predictedLocalSemrush.value != null) {
    return localPointsToGo.value > 0 && localPointsToGo.value <= 1;
  }
  return localPointsToGo.value > 0 && localPointsToGo.value <= 5 && localScore.value != null;
});

const localNearMissTitle = computed(() => {
  if (localGateCalibrated.value && predictedLocalSemrush.value != null) {
    return `预测 Semrush ${predictedLocalSemrush.value}/10，距 ${semrushPassThreshold.value} 还差 ${localPointsToGo.value} 分（规则分 ${localScore.value ?? "—"}/100 仅参考）`;
  }
  return `本地预检 ${localScore.value} 分，距 ${localPassThreshold.value} 分还差 ${localPointsToGo.value} 分`;
});

const localNearMissHint = computed(() => {
  const parts: string[] = [];
  const m = metrics.value;
  if (m?.longSentencesOver22 != null && m.longSentencesOver22 > 2) {
    parts.push(`超长句 ${m.longSentencesOver22} 条（须 ≤2）`);
  }
  if (m?.longParagraphsOver65 != null && m.longParagraphsOver65 > 1) {
    parts.push(`超长段 ${m.longParagraphsOver65} 段（须 ≤1）`);
  }
  if (m?.passiveVoiceHits != null && m.passiveVoiceHits > 6) {
    parts.push(`被动语态 ${m.passiveVoiceHits} 处（须 ≤6）`);
  }
  if (parts.length > 0) {
    return `优先修复：${parts.join("；")}。重新生成将自动追加优化轮次。`;
  }
  return "请按下方「本地评分建议」逐项修复，或点「重新生成」继续自动优化。";
});

const semrushScore = computed(() => props.semrushScore ?? semrush.value?.overall ?? null);

const semrushPointsToGo = computed(() => {
  if (semrushScore.value == null || semrushScore.value >= semrushPassThreshold.value) return 0;
  return Math.round((semrushPassThreshold.value - semrushScore.value) * 10) / 10;
});

const semrushNearMiss = computed(
  () =>
    !semrushSkipped.value &&
    semrushScore.value != null &&
    semrushScore.value >= Math.max(0, semrushPassThreshold.value - 1) &&
    semrushScore.value < semrushPassThreshold.value,
);

const semrushSkipped = computed(() => semrush.value?.skipped === true);

const publishStandardTitle = computed(() => {
  if (semrushSkipped.value) {
    return localGateCalibrated.value
      ? `发布标准：预测 Semrush ≥ ${semrushPassThreshold.value} 分（Semrush 未启用）`
      : `发布标准：本地预检 ≥ ${localPassThreshold.value} 分（Semrush 未启用）`;
  }
  if (localGateCalibrated.value) {
    return `评分流程：预测 Semrush ≥ ${semrushPassThreshold.value} 分（本地对齐）→ Semrush RPA 终检 ≥ ${semrushPassThreshold.value} 分`;
  }
  return `评分流程：本地预检 ≥ ${localPassThreshold.value} 分 → Semrush 终检 ≥ ${semrushPassThreshold.value} 分`;
});

const publishStandardDescription = computed(() => {
  if (semrushSkipped.value) {
    return "当前环境未配置 Semrush RPA，达到本地预检门槛后即可导出与推送 CMS。若日后启用 Semrush，终检分将成为额外权威门槛。";
  }
  if (localGateCalibrated.value) {
    return "本地进门闸已对齐 Semrush：用实验室校准模型预测 Semrush 分，与终检同一通过线；RPA 真分仍为最终权威。";
  }
  return "本地预检为进门闸（规则 0–100）；Semrush 终检为权威分，任务是否通过以此为准。";
});

const optimizeRounds = computed(() => local.value?.optimizeRounds);
const semrushOptimizeRounds = computed(() => semrush.value?.optimizeRounds);
const metrics = computed(() => local.value?.metrics);
const longSentenceSamples = computed(
  () => local.value?.metrics?.longSentenceSamples ?? [],
);
const longParagraphSamples = computed(
  () => local.value?.metrics?.longParagraphSamples ?? [],
);
const casualSentenceSamples = computed(
  () => local.value?.metrics?.casualSentenceSamples ?? [],
);
const semrushComplexWordSamples = computed(
  () => local.value?.metrics?.semrushComplexWordSamples ?? [],
);
const hardToReadSentenceSamples = computed(
  () => local.value?.metrics?.hardToReadSentenceSamples ?? [],
);
const semrushCheckRecordLabel = computed(() => {
  const rec = semrush.value?.semrushCheckRecord;
  if (!rec) return "";
  const parts = [`hash:${rec.contentHash}`];
  if (rec.nodeKey) parts.push(`节点:${rec.nodeKey}`);
  if (rec.domScore != null) parts.push(`DOM:${rec.domScore}`);
  if (rec.apiScore != null) parts.push(`API:${rec.apiScore}`);
  if (rec.checkedAt) parts.push(formatTime(rec.checkedAt));
  return parts.join(" · ");
});
const breakdown = computed(() => local.value?.breakdown);
const localSuggestions = computed(() => local.value?.suggestions ?? []);
const semrushSuggestions = computed(() => semrush.value?.suggestions ?? []);
const semrushNode = computed(
  () => semrush.value?.nodeLabel ?? semrush.value?.node ?? null,
);
const semrushEvaluationRoute = computed(
  () => semrush.value?.semrushEvaluationRoute ?? null,
);
const semrushEvaluationContentFingerprint = computed(
  () => semrush.value?.semrushEvaluationContentFingerprint ?? null,
);
const submittedKeywords = computed(() => semrush.value?.submittedKeywords ?? []);
const semrushReadabilityScore = computed(
  () => semrush.value?.semrushReadabilityScore ?? null
);
const semrushWordCountLabel = computed(() => {
  const current = semrush.value?.semrushCurrentWordCount;
  const competitor = semrush.value?.semrushCompetitorWordCount;
  if (current == null && competitor == null) return "";
  if (current != null && competitor != null) {
    return `当前 ${current} 词 · 竞品标杆 ${competitor} 词`;
  }
  if (current != null) return `当前约 ${current} 词`;
  return `竞品标杆约 ${competitor} 词`;
});

const semrushWordGap = computed(() => {
  const current = semrush.value?.semrushCurrentWordCount;
  const competitor = semrush.value?.semrushCompetitorWordCount;
  if (typeof current !== "number" || typeof competitor !== "number") return null;
  return competitor - current;
});

const semrushWordGapClass = computed(() => {
  const gap = semrushWordGap.value;
  if (gap == null) return "";
  if (gap > 150) return "text-red-700 font-medium";
  if (gap > 60) return "text-amber-700 font-medium";
  if (gap >= 0) return "text-gray-700";
  return "text-amber-700";
});
const analysisSource = computed(() => semrush.value?.analysisSource ?? null);
const analysisSourceLabel = computed(() => {
  const src = analysisSource.value;
  if (src === "api") return "Semrush 接口";
  if (src === "dom") return "页面侧栏";
  if (src === "mixed") return "接口 + 页面";
  return src ?? "-";
});

const semrushSuggestionSections = computed(() => {
  const details = semrush.value?.suggestionDetails;
  if (!details) return [];
  const sections = [
    { key: "readability", label: "可读性", items: details.readability ?? [] },
    { key: "seo", label: "SEO", items: details.seo ?? [] },
    { key: "tone", label: "语气", items: details.tone ?? [] },
    { key: "originality", label: "原创性", items: details.originality ?? [] },
  ];
  return sections.filter((s) => s.items.length > 0);
});

function mergeOptimizeHistory(
  fromSeo: ArticleJobOptimizeRound[] | null | undefined,
  fromDraft: ArticleJobOptimizeRound[] | null | undefined,
): ArticleJobOptimizeRound[] {
  const seo = fromSeo ?? [];
  const draft = fromDraft ?? [];
  if (seo.length === 0) return draft;
  if (draft.length === 0) return seo;

  const keyOf = (item: ArticleJobOptimizeRound) =>
    `${item.phase}|${item.round}|${item.kind ?? "optimize"}|${item.optimizedAt ?? ""}`;
  const merged = new Map<string, ArticleJobOptimizeRound>();
  for (const item of seo) merged.set(keyOf(item), item);
  for (const item of draft) merged.set(keyOf(item), item);
  return [...merged.values()].sort((a, b) =>
    (a.optimizedAt ?? "").localeCompare(b.optimizedAt ?? ""),
  );
}

const optimizeHistory = computed(() =>
  mergeOptimizeHistory(props.seoCheckData?.optimizeHistory, props.optimizeHistory),
);

interface OptimizeScoreRow extends ArticleJobOptimizeRound {
  roundLabel: string;
  delta: number | null;
  predictedDelta: number | null;
  semrushRouteChanged?: boolean;
}

const showPredictedOptimizeScores = computed(
  () =>
    localGateCalibrated.value ||
    optimizeHistory.value.some(
      (item) =>
        item.phase === "local" &&
        (item.predictedSemrushBefore != null ||
          item.predictedSemrushAfter != null ||
          item.candidatePredictedSemrush != null)
    )
);

const optimizeScoreRows = computed((): OptimizeScoreRow[] =>
  optimizeHistory.value.map((item, index, all) => {
    const baselineRoute =
      all.find((r) => r.phase === "semrush" && (r.kind === "baseline" || r.round === 0))
        ?.semrushEvaluationRoute ?? null;
    const isBaseline = item.kind === "baseline" || item.round === 0;
    let roundLabel = "";
    if (isBaseline) {
      roundLabel = item.phase === "local" ? "初稿" : "Semrush 初检";
    } else {
      roundLabel = `第 ${item.round} 轮${item.rolledBack ? "（已回滚）" : ""}`;
    }
    const delta =
      item.scoreBefore != null && item.scoreAfter != null
        ? Math.round((item.scoreAfter - item.scoreBefore) * 10) / 10
        : null;
    const predictedDelta =
      item.predictedSemrushBefore != null && item.predictedSemrushAfter != null
        ? Math.round((item.predictedSemrushAfter - item.predictedSemrushBefore) * 100) / 100
        : null;
    const semrushRouteChanged =
      item.phase === "semrush" &&
      baselineRoute != null &&
      item.semrushEvaluationRoute != null &&
      item.semrushEvaluationRoute !== baselineRoute;
    return { ...item, roundLabel, delta, predictedDelta, semrushRouteChanged };
  })
);

const activeOptimizePanels = ref<string[]>([]);

watch(
  optimizeHistory,
  (items) => {
    if (items.length > 0) {
      const latest = items[items.length - 1];
      activeOptimizePanels.value = [`${latest.phase}-${latest.round}-${latest.optimizedAt}`];
    }
  },
  { immediate: true }
);

const hasData = computed(
  () =>
    localScore.value != null ||
    props.seoCheckData != null ||
    optimizeHistory.value.length > 0
);
const canCheck = computed(() => props.canCheck ?? false);
const canRunSemrushCheck = computed(
  () => canCheck.value && localPassedForSemrush.value === true
);
const semrushGateReason = computed(() => {
  if (!canCheck.value) return "";
  if (localGateCalibrated.value) {
    if (predictedLocalSemrush.value == null) {
      return "预测 Semrush 分尚未就绪，请刷新页面或先保存稿件后再终检";
    }
    if (localPassedForSemrush.value === false) {
      return `预测 Semrush ${predictedLocalSemrush.value}/10，未达 ${semrushPassThreshold.value} 分，请优化后再终检（规则分 ${localScore.value ?? "—"}/100 仅参考）`;
    }
    if (localPassed.value === false && localPassedForSemrush.value === true) {
      return `预测 Semrush ${predictedLocalSemrush.value}/10 接近 ${semrushPassThreshold.value} 分，可进行终检（终检真分仍以 RPA 为准）`;
    }
    return "";
  }
  if (localScore.value == null) {
    return `须先完成本地预检（≥${localPassThreshold.value} 分）后方可 Semrush 终检`;
  }
  if (localPassed.value === false) {
    return `本地预检 ${localScore.value} 分，未达 ${localPassThreshold.value} 分，请按下方建议优化后再终检`;
  }
  return "";
});
const checking = computed(() => props.checking ?? false);
const checkStale = computed(() => props.checkStale ?? false);
const optimizingMessage = computed(() => props.optimizingMessage ?? "");
const canRewrite = computed(() => props.canRewrite ?? false);
const rewriting = computed(() => props.rewriting ?? false);
const rewriteBlockedReason = computed(() => props.rewriteBlockedReason ?? "");

function phaseLabel(phase: ArticleJobOptimizeRound["phase"]) {
  return phase === "local" ? "本地 SEO" : "Semrush";
}

function phaseTagType(phase: ArticleJobOptimizeRound["phase"]) {
  return phase === "local" ? "primary" : "success";
}

function formatRoundScore(
  score: number | null | undefined,
  phase: ArticleJobOptimizeRound["phase"]
) {
  if (score == null) return "-";
  return phase === "local" ? `${score} / 100` : `${score} / 10`;
}

function formatPredictedSemrush(score: number | null | undefined): string {
  if (score == null) return "-";
  return `${Math.round(score * 100) / 100} / 10`;
}

function formatRowPredictedScore(row: unknown, which: "before" | "after"): string {
  const item = asOptimizeRow(row);
  if (item.phase !== "local") return "-";
  const score =
    which === "before" ? item.predictedSemrushBefore : item.predictedSemrushAfter;
  return formatPredictedSemrush(score);
}

function getRowPredictedDelta(row: unknown): number | null {
  const item = asOptimizeRow(row);
  if (item.phase !== "local") return null;
  if (item.predictedSemrushBefore == null || item.predictedSemrushAfter == null) {
    return null;
  }
  return Math.round((item.predictedSemrushAfter - item.predictedSemrushBefore) * 100) / 100;
}

function formatOptimizePredictedSummary(item: ArticleJobOptimizeRound): string {
  if (item.phase !== "local") return "";
  const before = item.predictedSemrushBefore;
  const after = item.predictedSemrushAfter;
  if (before != null && after != null) {
    return `${Math.round(before * 100) / 100} → ${Math.round(after * 100) / 100}`;
  }
  if (after != null) return `${Math.round(after * 100) / 100} / 10`;
  return "";
}

function formatRollbackReason(row: ArticleJobOptimizeRound): string {
  if (row.phase === "local" && localGateCalibrated.value) {
    if (row.rollbackReason === "keyword_coverage_regressed") {
      return "关键词覆盖下降";
    }
    return "预测 Semrush 未提升";
  }
  if (row.phase === "local") {
    return "本地分未提升";
  }
  if (row.rollbackReason === "local_below_threshold") {
    return `本地分 ${row.candidateLocalScoreAfter ?? "?"} 低于保留门槛（历史策略，已改为 Semrush 优先）`;
  }
  if (row.rollbackReason === "both") {
    return `Semrush 未提升且本地分 ${row.candidateLocalScoreAfter ?? "?"} 未达 ${localPassThreshold.value}（历史策略）`;
  }
  return "Semrush 分未提升";
}

function formatRollbackDetail(item: ArticleJobOptimizeRound): string {
  if (!item.rolledBack || item.candidateScoreAfter == null) {
    return "本轮改稿未通过验收，已恢复历史最优稿。";
  }
  const kept = formatRoundScore(item.scoreAfter, item.phase);
  const candidate = formatRoundScore(item.candidateScoreAfter, item.phase);
  if (item.phase === "local") {
    if (localGateCalibrated.value) {
      const keptPredicted = formatPredictedSemrush(item.predictedSemrushAfter);
      const candidatePredicted =
        item.candidatePredictedSemrush != null
          ? formatPredictedSemrush(item.candidatePredictedSemrush)
          : null;
      if (candidatePredicted) {
        return `AI 改稿后规则分 ${candidate}，预测 ${candidatePredicted} 未超过保留稿（规则分 ${kept}，预测 ${keptPredicted}），已回滚。`;
      }
      return `AI 改稿后规则分 ${candidate}，预测 Semrush 未超过保留稿（规则分 ${kept}），已回滚。`;
    }
    return `AI 改稿后本地预检为 ${candidate}，未超过保留稿 ${kept}，已回滚。`;
  }
  const keptLocal =
    item.localScoreAfter != null ? `${item.localScoreAfter} / 100` : "—";
  const candidateLocal =
    item.candidateLocalScoreAfter != null
      ? `${item.candidateLocalScoreAfter} / 100`
      : "—";
  if (item.rollbackReason === "local_below_threshold") {
    return `Semrush 候选 ${candidate}，但本地分 ${candidateLocal} 低于历史保留门槛，已保留 Semrush ${kept}、本地 ${keptLocal} 的最优稿（当前策略：Semrush 优先）。`;
  }
  if (item.rollbackReason === "both") {
    return `Semrush 候选 ${candidate} 未提升，且本地分 ${candidateLocal} 低于门槛 ${localPassThreshold.value}，已保留 Semrush ${kept}、本地 ${keptLocal} 的最优稿。`;
  }
  return `Semrush 候选 ${candidate} 未超过保留稿 ${kept}（本地 ${candidateLocal}），已回滚。`;
}

function formatDelta(delta: number) {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `${delta}`;
  return "0";
}

function asOptimizeRow(row: unknown): ArticleJobOptimizeRound {
  return row as ArticleJobOptimizeRound;
}

function formatRowScore(row: unknown, which: "before" | "after") {
  const item = asOptimizeRow(row);
  return formatRoundScore(
    which === "before" ? item.scoreBefore : item.scoreAfter,
    item.phase,
  );
}

function formatRowLocalScoreDetail(row: unknown): string {
  const item = asOptimizeRow(row);
  if (item.phase === "semrush" && item.rolledBack && item.candidateLocalScoreAfter != null) {
    const kept = item.localScoreAfter != null ? `${item.localScoreAfter}` : "?";
    return `${item.candidateLocalScoreAfter}→${kept}`;
  }
  return item.localScoreAfter != null ? `${item.localScoreAfter}` : "";
}

function formatRowLocalScore(row: unknown) {
  const detail = formatRowLocalScoreDetail(row);
  return detail || "-";
}

function formatRowTime(row: unknown) {
  return formatTime(asOptimizeRow(row).optimizedAt);
}

function getRowDelta(row: unknown): number | null {
  const item = asOptimizeRow(row);
  if (item.scoreBefore == null || item.scoreAfter == null) return null;
  return Math.round((item.scoreAfter - item.scoreBefore) * 10) / 10;
}

function scoreDeltaClass(delta: number | null) {
  if (delta == null) return "";
  if (delta > 0) return "text-green-600 font-medium";
  if (delta < 0) return "text-red-600 font-medium";
  return "text-gray-500";
}

function formatTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("zh-CN");
}

function readabilityMetricClass(value: number, maxAllowed: number) {
  if (value <= maxAllowed) return "text-green-600";
  return "text-red-600 font-medium";
}

const localTagType = computed(() => {
  if (localScore.value == null) return "info";
  if (localScore.value >= localPassThreshold.value) return "success";
  if (localScore.value >= 60) return "warning";
  return "danger";
});

const semrushTagType = computed(() => {
  if (semrushScore.value == null) return "info";
  if (semrush.value?.passed === true || semrushScore.value >= semrushPassThreshold.value) {
    return "success";
  }
  if (semrushScore.value >= 8) return "warning";
  return "danger";
});

const BREAKDOWN_MAX: Record<string, number> = {
  keyword: 25,
  serp: 25,
  structure: 20,
  readability: 20,
  depth: 10,
};

function breakdownValueClass(item: { value: number; max: number }) {
  if (item.value >= item.max) return "text-green-600";
  if (item.max - item.value <= 6) return "text-amber-600";
  return "text-red-600";
}

const breakdownItems = computed(() => {
  const b = breakdown.value;
  if (!b) return [];
  const items = [
    { key: "keyword", label: "关键词", value: b.keywordCoverage, max: BREAKDOWN_MAX.keyword },
    { key: "serp", label: "搜索词", value: b.serpTermAlignment, max: BREAKDOWN_MAX.serp },
    { key: "structure", label: "结构", value: b.structure, max: BREAKDOWN_MAX.structure },
    { key: "readability", label: "可读性", value: b.readability ?? 0, max: BREAKDOWN_MAX.readability },
    { key: "depth", label: "深度", value: b.contentDepth, max: BREAKDOWN_MAX.depth },
  ];
  return items
    .filter((item) => item.value != null)
    .map((item) => ({ ...item, gap: item.max - item.value }));
});
</script>
