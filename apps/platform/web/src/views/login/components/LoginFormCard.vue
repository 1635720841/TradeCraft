<!--
  登录页右侧登录卡片：账号密码表单、记住我与 Logto 入口。
-->
<template>
  <section class="mw-login-shell" aria-label="登录区域">
    <div class="mw-login-card">
      <div class="mw-brand">
        <img :src="logo" alt="MERWISE" class="mw-brand-logo" />
      </div>

      <div class="mw-login-heading">
        <h2>欢迎登录</h2>
        <p>登录 MERWISE 外贸增长平台</p>
      </div>

      <el-form
        ref="ruleFormRef"
        class="mw-login-form"
        :model="formModel"
        :rules="loginRules"
        @submit.prevent="emit('submit')"
      >
        <el-form-item prop="username" class="mw-form-item">
          <label class="mw-field">
            <svg
              class="mw-field-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.9"
            >
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="m3 7 9 6 9-6" />
            </svg>
            <input
              v-model="username"
              class="mw-input"
              type="text"
              autocomplete="username"
              placeholder="请输入邮箱 / 账号"
            />
          </label>
        </el-form-item>

        <el-form-item prop="password" class="mw-form-item">
          <label class="mw-field">
            <svg
              class="mw-field-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.9"
            >
              <rect x="4" y="10" width="16" height="10" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
            <input
              v-model="password"
              class="mw-input"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              placeholder="请输入密码"
            />
            <button
              class="mw-toggle-password"
              type="button"
              aria-label="显示或隐藏密码"
              @click="showPassword = !showPassword"
            >
              <svg
                v-if="showPassword"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.9"
              >
                <path
                  d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-10-6-10-6a18.45 18.45 0 0 1 5.06-5.94"
                />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 6 10 6a18.5 18.5 0 0 1-2.16 3.19" />
                <path d="M1 1l22 22" />
              </svg>
              <svg
                v-else
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.9"
              >
                <path d="M2 12s3.4-6 10-6 10 6 10 6-3.4 6-10 6S2 12 2 12Z" />
                <circle cx="12" cy="12" r="2.7" />
              </svg>
            </button>
          </label>
        </el-form-item>

        <div class="mw-form-meta">
          <label class="mw-remember">
            <input v-model="remember" type="checkbox" />
            <span>记住我</span>
          </label>
          <a class="mw-forgot" @click.prevent="emit('forgot')">忘记密码？</a>
        </div>

        <button class="mw-btn mw-btn-primary" type="submit" :disabled="disabled || loading">
          {{ loading ? "登录中…" : "登 录" }}
        </button>
        <button
          class="mw-btn mw-btn-secondary"
          type="button"
          :disabled="loading"
          @click="emit('trial')"
        >
          申请试用
        </button>

        <template v-if="logtoEnabled">
          <div class="mw-logto-divider">或</div>
          <button
            class="mw-btn mw-btn-secondary"
            type="button"
            :disabled="loading"
            @click="emit('logto-login')"
          >
            使用 Logto 登录
          </button>
        </template>
      </el-form>

      <div class="mw-security">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 3 20 6v5c0 5-3.3 8.6-8 10-4.7-1.4-8-5-8-10V6l8-3Z" />
          <path d="m8.5 12 2.2 2.2 4.8-4.8" />
        </svg>
        <span>安全、稳定、企业级 · 您的数据将得到严格保护</span>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { FormInstance } from "element-plus";
import { loginRules } from "../utils/rule";
import { logo } from "../utils/static";

defineProps<{
  loading: boolean;
  disabled: boolean;
  logtoEnabled?: boolean;
}>();

const emit = defineEmits<{
  submit: [];
  trial: [];
  forgot: [];
  "logto-login": [];
}>();

const username = defineModel<string>("username", { required: true });
const password = defineModel<string>("password", { required: true });
const remember = defineModel<boolean>("remember", { default: false });

const ruleFormRef = ref<FormInstance>();
const showPassword = ref(false);

const formModel = computed(() => ({
  username: username.value,
  password: password.value
}));

async function validateForm() {
  if (!ruleFormRef.value) return false;
  try {
    await ruleFormRef.value.validate();
    return true;
  } catch {
    return false;
  }
}

defineExpose({ validateForm });
</script>

<style scoped>
.mw-login-form {
  width: 100%;
}

.mw-form-item {
  margin-bottom: 0;
}

.mw-form-item :deep(.el-form-item__content) {
  width: 100%;
  margin-left: 0 !important;
  line-height: 1;
}

.mw-form-item :deep(.el-form-item__error) {
  padding-top: 6px;
  padding-left: 2px;
  font-size: 12px;
  line-height: 1.4;
}

.mw-field {
  display: block;
  width: 100%;
}

.mw-input {
  display: block;
  width: 100%;
  height: clamp(48px, 6vh, 56px);
  padding: 0 48px;
  border: 1px solid var(--mw-line);
  border-radius: 12px;
  outline: none;
  color: #1c3864;
  font: inherit;
  font-size: 15px;
  background: rgb(255 255 255 / 94%);
  transition:
    border-color 0.2s,
    box-shadow 0.2s,
    background 0.2s;
  box-sizing: border-box;
}

.mw-input::placeholder {
  color: #a5b2c3;
}

.mw-input:focus {
  border-color: #4f8dff;
  background: #fff;
  box-shadow: 0 0 0 4px rgb(37 116 233 / 12%);
}
</style>
