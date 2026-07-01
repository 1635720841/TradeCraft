<script setup lang="ts">
import { useI18n } from "vue-i18n";
import LayFrame from "../lay-frame/index.vue";
import LayFooter from "../lay-footer/index.vue";
import { useTags } from "@/layout/hooks/useTag";
import { useGlobal, isNumber } from "@pureadmin/utils";
import BackTopIcon from "@/assets/svg/back_top.svg?component";
import { h, computed, Transition, defineComponent, type CSSProperties } from "vue";
import { useRoute, type RouteLocationNormalizedLoaded } from "vue-router";
import { usePermissionStoreHook } from "@/store/modules/permission";
import {
  getContentRouteKey,
  isProjectWorkbenchPath
} from "@/layout/utils/route-shell";
import OrgSubscriptionBanner from "../OrgSubscriptionBanner.vue";
import ImpersonationBanner from "../ImpersonationBanner.vue";

const props = defineProps({
  fixedHeader: Boolean
});

const { t } = useI18n();
const route = useRoute();
const { showModel } = useTags();
const { $storage, $config } = useGlobal<GlobalPropertiesApi>();

const isKeepAlive = computed(() => {
  return $config?.KeepAlive;
});

const transitions = computed(() => {
  return route => {
    return route.meta.transition;
  };
});

const hideTabs = computed(() => {
  // 标签栏已在 layout/index.vue 中整体隐藏，这里恒为 true 以去掉顶部预留的标签栏高度
  return true;
});

const hideFooter = computed(() => {
  return $storage?.configure.hideFooter;
});

const fillViewport = computed(() => Boolean(route.meta?.fillViewport));
const hideFooterRoute = computed(() => Boolean(route.meta?.hideFooter));
const showFooter = computed(() => !hideFooter.value && !hideFooterRoute.value);

const stretch = computed(() => {
  return $storage?.configure.stretch;
});

const layout = computed(() => {
  return $storage?.layout.layout === "vertical";
});

const getMainWidth = computed(() => {
  if (fillViewport.value) return "100%";
  return isNumber(stretch.value)
    ? stretch.value + "px"
    : stretch.value
      ? "1440px"
      : "100%";
});

const getScrollWrapStyle = computed((): CSSProperties => ({
  display: "flex",
  flexWrap: "wrap",
  width: fillViewport.value ? "100%" : undefined,
  maxWidth: getMainWidth.value,
  margin: fillViewport.value ? "0" : "0 auto",
  transition: "all 300ms cubic-bezier(0.4, 0, 0.2, 1)"
}));

const getSectionStyle = computed(() => {
  return [
    hideTabs.value && layout ? "padding-top: var(--shell-header-height, 70px);" : "",
    !hideTabs.value && layout
      ? showModel.value == "chrome"
        ? "padding-top: 96px;"
        : "padding-top: 92px;"
      : "",
    hideTabs.value && !layout.value ? "padding-top: var(--shell-header-height, 70px);" : "",
    !hideTabs.value && !layout.value
      ? showModel.value == "chrome"
        ? "padding-top: 96px;"
        : "padding-top: 92px;"
      : "",
    props.fixedHeader
      ? ""
      : `padding-top: 0;${
          hideTabs.value
            ? "min-height: calc(100vh - var(--shell-header-height, 70px));"
            : "min-height: calc(100vh - 92px);"
        }`
  ];
});

const transitionMain = defineComponent({
  props: {
    route: {
      type: undefined,
      required: true
    }
  },
  render() {
    const currentRoute = this.route as RouteLocationNormalizedLoaded;
    if (isProjectWorkbenchPath(currentRoute.path)) {
      return this.$slots.default();
    }

    const transitionName =
      transitions.value(currentRoute)?.name || "fade-transform";
    const enterTransition = transitions.value(currentRoute)?.enterTransition;
    const leaveTransition = transitions.value(currentRoute)?.leaveTransition;
    return h(
      Transition,
      {
        name: enterTransition ? "pure-classes-transition" : transitionName,
        enterActiveClass: enterTransition
          ? `animate__animated ${enterTransition}`
          : undefined,
        leaveActiveClass: leaveTransition
          ? `animate__animated ${leaveTransition}`
          : undefined,
        mode: "out-in",
        appear: true
      },
      {
        default: () => [this.$slots.default()]
      }
    );
  }
});
</script>

<template>
  <section
    :class="[
      fixedHeader ? 'app-main' : 'app-main-nofixed-header',
      { 'app-main--fill': fillViewport }
    ]"
    :style="getSectionStyle"
  >
    <OrgSubscriptionBanner />
    <ImpersonationBanner />
    <router-view>
      <template #default="{ Component, route }">
        <LayFrame :currComp="Component" :currRoute="route">
          <template #default="{ Comp, fullPath, frameInfo }">
            <el-scrollbar
              v-if="fixedHeader"
              :class="{ 'app-main__scroll--fill': fillViewport }"
              :wrap-style="getScrollWrapStyle"
              :view-style="{
                display: 'flex',
                flex: 'auto',
                overflow: 'hidden',
                flexDirection: 'column'
              }"
            >
              <el-backtop
                v-if="!fillViewport"
                :title="t('buttons.pureBackTop')"
                target=".app-main .el-scrollbar__wrap"
              >
                <BackTopIcon />
              </el-backtop>
              <div class="grow" :class="{ 'grow--fill': fillViewport }">
                <transitionMain :route="route">
                  <keep-alive
                    v-if="isKeepAlive"
                    :include="usePermissionStoreHook().cachePageList"
                  >
                    <component
                      :is="Comp"
                      :key="getContentRouteKey(route)"
                      :frameInfo="frameInfo"
                      class="main-content"
                      :class="{ 'main-content--fill': fillViewport }"
                    />
                  </keep-alive>
                  <component
                    :is="Comp"
                    v-else
                    :key="getContentRouteKey(route)"
                    :frameInfo="frameInfo"
                    class="main-content"
                    :class="{ 'main-content--fill': fillViewport }"
                  />
                </transitionMain>
              </div>
              <LayFooter v-if="showFooter" />
            </el-scrollbar>
            <div v-else class="grow">
              <transitionMain :route="route">
                <keep-alive
                  v-if="isKeepAlive"
                  :include="usePermissionStoreHook().cachePageList"
                >
                  <component
                    :is="Comp"
                    :key="getContentRouteKey(route)"
                    :frameInfo="frameInfo"
                    class="main-content"
                  />
                </keep-alive>
                <component
                  :is="Comp"
                  v-else
                  :key="getContentRouteKey(route)"
                  :frameInfo="frameInfo"
                  class="main-content"
                />
              </transitionMain>
            </div>
          </template>
        </LayFrame>
      </template>
    </router-view>

    <!-- 页脚 -->
    <LayFooter v-if="showFooter && !fixedHeader" />
  </section>
</template>

<style scoped>
.app-main {
  position: relative;
  box-sizing: border-box;
  width: 100%;
  height: 100vh;
  overflow: hidden;
}

.app-main-nofixed-header {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
}

/* 让滚动容器撑满 header 以下的剩余高度 */
.app-main :deep(.el-scrollbar) {
  height: 100%;
}

.app-main :deep(.el-scrollbar__wrap) {
  height: 100% !important;
}

.app-main :deep(.el-scrollbar__view) {
  min-height: 100%;
}

.app-main :deep(.grow--fill) {
  width: 100%;
  min-height: 0;
  height: 100%;
}

.app-main :deep(.grow--fill > *) {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.app-main--fill :deep(.app-main__scroll--fill .el-scrollbar__wrap) {
  overflow: hidden !important;
}

.app-main--fill :deep(.app-main__scroll--fill .el-scrollbar__view) {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0 !important;
}

.main-content--fill {
  display: flex;
  flex: 1;
  flex-direction: column;
  width: 100%;
  min-height: 0;
  height: 100%;
  padding: 12px 16px;
  overflow: hidden;
}

.app-main :deep(.grow) {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 100%;
}
</style>
