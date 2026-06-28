<!--
  MERWISE 登录页：品牌介绍区 + 登录表单，保留账号密码与 Logto 登录能力。
-->
<template>
  <main class="mw-page select-none" :style="pageStyle">
    <img class="mw-hero-deco" :src="heroDeco" alt="" aria-hidden="true" />
    <LoginHeroSection />
    <LoginFormCard
      ref="formCardRef"
      v-model:username="ruleForm.username"
      v-model:password="ruleForm.password"
      v-model:remember="rememberMe"
      :loading="loading"
      :disabled="disabled"
      :logto-enabled="!!logtoConfig?.enabled"
      @submit="immediateDebounce()"
      @trial="onTrial"
      @forgot="onForgot"
      @logto-login="onLogtoLogin"
    />
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { debounce } from "@pureadmin/utils";
import { useEventListener } from "@vueuse/core";
import { getLogtoConfig, type LogtoConfigResult } from "@/api/user";
import { initRouter, getTopMenu } from "@/router/utils";
import { useUserStoreHook } from "@/store/modules/user";
import { message } from "@/utils/message";
import { loginBg, heroDeco } from "./utils/static";
import "./styles/merwise-login.css";
import LoginHeroSection from "./components/LoginHeroSection.vue";
import LoginFormCard from "./components/LoginFormCard.vue";

defineOptions({
  name: "Login"
});

const REMEMBER_KEY = "merwise-login-remember";
const USERNAME_KEY = "merwise-login-username";

const router = useRouter();
const loading = ref(false);
const disabled = ref(false);
const rememberMe = ref(false);
const formCardRef = ref<InstanceType<typeof LoginFormCard>>();
const logtoConfig = ref<LogtoConfigResult["data"] | null>(null);

const ruleForm = reactive({
  username: "admin@dev.local",
  password: "admin123"
});

const pageStyle = computed(() => ({
  "--mw-page-bg": `url("${loginBg}")`
}));

onMounted(async () => {
  document.documentElement.classList.add("mw-login-active");

  const savedRemember = localStorage.getItem(REMEMBER_KEY) === "1";
  const savedUsername = localStorage.getItem(USERNAME_KEY);
  if (savedRemember && savedUsername) {
    rememberMe.value = true;
    ruleForm.username = savedUsername;
  }

  try {
    const res = await getLogtoConfig();
    if (res?.success && res.data?.enabled) {
      logtoConfig.value = res.data;
    }
  } catch {
    // Logto 未配置时忽略
  }
});

onUnmounted(() => {
  document.documentElement.classList.remove("mw-login-active");
});

const persistRemember = () => {
  if (rememberMe.value) {
    localStorage.setItem(REMEMBER_KEY, "1");
    localStorage.setItem(USERNAME_KEY, ruleForm.username);
    return;
  }
  localStorage.removeItem(REMEMBER_KEY);
  localStorage.removeItem(USERNAME_KEY);
};

const onLogin = async () => {
  const valid = await formCardRef.value?.validateForm();
  if (!valid) return;

  loading.value = true;
  useUserStoreHook()
    .loginByUsername({
      username: ruleForm.username,
      password: ruleForm.password
    })
    .then(res => {
      if (res.success) {
        persistRemember();
        return initRouter().then(() => {
          disabled.value = true;
          router
            .push(getTopMenu(true).path)
            .then(() => {
              message("登录成功", { type: "success" });
            })
            .finally(() => {
              disabled.value = false;
            });
        });
      }
      message("登录失败", { type: "error" });
    })
    .catch(() => {
      // 错误文案由 HTTP 拦截器展示后端 error.message
    })
    .finally(() => {
      loading.value = false;
    });
};

const immediateDebounce: () => void = debounce(onLogin, 1000, true);

const onLogtoLogin = () => {
  const url = logtoConfig.value?.authorizeUrl;
  if (!url) {
    message("Logto 未配置", { type: "warning" });
    return;
  }
  window.location.href = url;
};

const onTrial = () => {
  message("请联系商务申请试用", { type: "info" });
};

const onForgot = () => {
  message("请联系管理员重置密码", { type: "info" });
};

useEventListener(document, "keydown", ({ code }) => {
  if (
    ["Enter", "NumpadEnter"].includes(code) &&
    !disabled.value &&
    !loading.value
  ) {
    immediateDebounce();
  }
});
</script>