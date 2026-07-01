<!--
  Prompt 编辑/新建对话框。
-->
<template>
  <el-dialog
    :model-value="visible"
    :title="mode === 'create' ? '新建 Prompt 版本' : `编辑 · ${form.version}`"
    width="960px"
    destroy-on-close
    top="4vh"
    class="prompt-editor-dialog"
    @update:model-value="emit('update:visible', $event)"
  >
    <div class="flex flex-col gap-4 lg:flex-row">
      <div v-if="slotInfo" class="lg:w-72 shrink-0 rounded-lg bg-gray-50 p-4 text-sm">
        <div class="font-medium mw-text-body">功能说明</div>
        <el-tag class="mt-2" type="success" size="small">线上使用中</el-tag>
        <dl class="mt-3 space-y-2 mw-text-body">
          <div>
            <dt class="text-xs mw-text-muted">功能</dt>
            <dd>{{ slotInfo.label }}</dd>
          </div>
          <div>
            <dt class="text-xs mw-text-muted">触发时机</dt>
            <dd>{{ slotInfo.trigger }}</dd>
          </div>
          <div>
            <dt class="text-xs mw-text-muted">任务里怎么看</dt>
            <dd>{{ slotInfo.uiLocation }}</dd>
          </div>
        </dl>
        <div class="mt-3 text-xs mw-text-muted">可用占位符</div>
        <div class="mt-1 flex flex-wrap gap-1">
          <el-tag v-for="ph in slotInfo.placeholders" :key="ph" size="small" type="info" effect="plain">
            {{ ph }}
          </el-tag>
        </div>
      </div>

      <div
        v-else-if="mode === 'edit'"
        class="lg:w-72 shrink-0 rounded-lg mw-bg-warning-soft p-4 text-sm mw-text-body"
      >
        <div class="font-medium">此版本当前未绑定到任何功能</div>
        <p class="mt-2 text-xs leading-relaxed opacity-90">
          可在上方「当前线上配置」中选择此版本并点「应用」，即可让对应功能使用它。
        </p>
      </div>

      <el-form ref="innerFormRef" class="min-w-0 flex-1" :model="form" :rules="rules" label-width="88px">
        <el-form-item v-if="mode === 'create'" label="版本 ID" prop="version">
          <el-input v-model="form.version" placeholder="seo_brief_v2" />
          <div class="mt-1 text-xs mw-text-muted">须 seo_ 开头，如 seo_brief_v2、seo_draft_v2</div>
        </el-form-item>
        <el-form-item label="显示名称" prop="name">
          <el-input v-model="form.name" placeholder="SEO Brief v2" />
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="form.description" type="textarea" :rows="2" placeholder="备注" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.isActive" />
          <span class="ml-2 text-xs mw-text-muted">停用后回退到 prompts 目录下的同名文件</span>
        </el-form-item>
        <el-form-item label="Prompt 正文" prop="content">
          <el-input
            v-model="form.content"
            type="textarea"
            :rows="mode === 'create' ? 16 : 20"
            placeholder="Markdown 模板正文"
          />
        </el-form-item>
      </el-form>
    </div>

    <template #footer>
      <div class="flex w-full items-center justify-between">
        <div>
          <el-button
            v-if="mode === 'edit' && deleteAllowed"
            type="danger"
            plain
            :loading="deleting"
            @click="emit('delete')"
          >
            删除此版本
          </el-button>
          <span v-else-if="mode === 'edit' && !deleteAllowed" class="text-xs mw-text-muted">
            {{ deleteReason }}
          </span>
        </div>
        <div class="flex gap-2">
          <el-button @click="emit('update:visible', false)">取消</el-button>
          <el-button type="primary" :loading="submitting" @click="onSubmit">保存并刷新缓存</el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from "vue";
import type { FormInstance, FormRules } from "element-plus";
import type { PromptRuntimeSlot } from "@/api/console/prompt";

defineOptions({ name: "PromptEditorDialog" });

defineProps<{
  visible: boolean;
  mode: "create" | "edit";
  form: {
    version: string;
    name: string;
    description: string;
    content: string;
    isActive: boolean;
  };
  rules: FormRules;
  slotInfo?: PromptRuntimeSlot | null;
  submitting: boolean;
  deleting: boolean;
  deleteAllowed: boolean;
  deleteReason?: string;
}>();

const emit = defineEmits<{
  "update:visible": [value: boolean];
  submit: [];
  delete: [];
}>();

const innerFormRef = ref<FormInstance>();

async function onSubmit() {
  const form = innerFormRef.value;
  if (!form) return;
  await form.validate((valid) => {
    if (valid) emit("submit");
  });
}
</script>
