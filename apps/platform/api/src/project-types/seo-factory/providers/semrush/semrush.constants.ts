/** 3ue 共享 Semrush RPA 常量 */

export const SEMRUSH_RPA_TIMEOUT_MS = 120_000;

/** SWA 侧栏/表单项轮询间隔（页面常为 SPA 异步加载） */
export const SEMRUSH_UI_POLL_MS = Number(process.env.SEMRUSH_UI_POLL_MS ?? 2_000);

/** 点击展开、填表后的短暂停顿，等待 Angular 渲染 */
export const SEMRUSH_UI_SETTLE_MS = Number(process.env.SEMRUSH_UI_SETTLE_MS ?? 2_500);

/** 侧栏分数连续相同读数达到此次数后才视为终态（避免分析未完成就退出） */
export const SEMRUSH_SCORE_STABLE_POLLS = Number(process.env.SEMRUSH_SCORE_STABLE_POLLS ?? 3);

/** checker 编辑器就绪最长等待 */
export const SEMRUSH_SWA_EDITOR_TIMEOUT_MS = Number(
  process.env.SEMRUSH_SWA_EDITOR_TIMEOUT_MS ?? 90_000,
);

/** 右侧「内容推荐」+ 关键词区最长等待 */
export const SEMRUSH_SWA_SIDEBAR_TIMEOUT_MS = Number(
  process.env.SEMRUSH_SWA_SIDEBAR_TIMEOUT_MS ?? 90_000,
);

export const TOOLS_SHARE_LOGIN_URL = 'https://dash.3ue.com/zh-Hans/';
export const TOOLS_SHARE_HOME_URL = 'https://dash.3ue.com/zh-Hans/#/page/m/home';

/** Semrush SWA 路径（域名与 __gmitm 由「打开」跳转自动携带） */
export const SEMRUSH_SWA_PATH = '/swa/';

/** 3ue 打开 Semrush 时的空白 cache-clean 中转页，未完成前禁止导航 */
export const SEMRUSH_CACHE_CLEAN_PATTERN = /gmitm\.clean\.cache/i;

/** @deprecated 节点已改为随机打乱在线列表，此配置不再影响选路 */
export const SEMRUSH_DEFAULT_NODE = process.env.SEMRUSH_3UE_NODE?.trim() ?? '';

/** 单个节点等待 Semrush 主站就绪的超时（毫秒），超时后换下一个节点 */
export const SEMRUSH_NODE_ATTEMPT_TIMEOUT_MS = Number(
  process.env.SEMRUSH_NODE_ATTEMPT_TIMEOUT_MS ?? 45_000,
);

/** cache-clean 中转页超过此时长未跳转则判定节点失败 */
export const SEMRUSH_CACHE_CLEAN_MAX_MS = Number(process.env.SEMRUSH_CACHE_CLEAN_MAX_MS ?? 12_000);

/** 最多尝试几个节点（含偏好节点） */
export const SEMRUSH_NODE_MAX_ATTEMPTS = Number(process.env.SEMRUSH_NODE_MAX_ATTEMPTS ?? 5);

/**
 * 浏览器通道：chrome | msedge | chromium（内置）
 * 3ue/Semrush 经 gmitm 代理，内置 Chromium 易白屏卡死，推荐 chrome
 */
export const SEMRUSH_BROWSER_CHANNEL = process.env.SEMRUSH_BROWSER_CHANNEL?.trim() || 'chrome';
