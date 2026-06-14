/**
 * 3ue / Semrush SWA 页面选择器（由 scripts/semrush-dom-probe.mjs 探测）。
 */

/** Tools Share 登录页（Nebular Angular） */
export const TOOLS_SHARE_SELECTORS = {
  username: '#input-username',
  password: '#input-password',
  loginButton: 'button[status="primary"]:has-text("登录")',
  /** 订阅卡片「打开」 */
  openSemrush: 'button:has-text("打开")',
  /** Semrush 卡片内节点选择（Nebular nb-select） */
  semrushCard: 'nb-card:has(button:has-text("打开"))',
  nodeSelectButton: 'nb-select button.select-button',
  nodeOption: '.cdk-overlay-container nb-option',
} as const;

/** Semrush SEO Writing Assistant */
export const SEMRUSH_SWA_SELECTORS = {
  newAnalysis:
    'a:has-text("分析新文本"), button:has-text("分析新文本"), a:has-text("Analyze new text"), button:has-text("Analyze new text")',
  newDocument:
    'a:has-text("新文档"), button:has-text("新文档"), a:has-text("New document"), button:has-text("New document")',
  /** 新文档页编辑器先出现；关键词在右侧「设置新目标」折叠区内 */
  editor: '.ql-editor[contenteditable="true"], [contenteditable="true"].ql-editor, div.ql-editor',
  contentPanel:
    'text=内容推荐, text=Content Recommendations, [class*="recommendation" i], [class*="sidebar" i]',
  setNewGoals:
    'button:has-text("设置新目标"), [role="button"]:has-text("设置新目标"), summary:has-text("设置新目标"), text=设置新目标, text=Set new goal, text=Set new goals',
  keywordInput:
    '[data-test="swa-spa-checker-widget"] input[placeholder*="输入以逗号分隔"], [data-test="swa-spa-checker-widget"] [class*="SInputTags"] input, input[placeholder*="输入以逗号分隔"], input[placeholder*="关键词"], input[placeholder*="keyword"], input[placeholder*="逗号"], input[placeholder*="Keyword"], input[aria-label*="关键词"], input[aria-label*="keyword"], [class*="SInputTags"] input[type="text"], input[type="text"][class*="keyword" i], textarea[placeholder*="关键词"], textarea[placeholder*="keyword"]',
  applyKeywordGoal:
    '[data-test="swa-spa-checker-widget"] button:has-text("应用"), [data-test="swa-spa-checker-widget"] button:has-text("确认"), [data-test="swa-spa-checker-widget"] button:has-text("设置目标"), [data-test="swa-spa-checker-widget"] button:has-text("开始"), [data-test="swa-spa-checker-widget"] button:has-text("Apply"), [data-test="swa-spa-checker-widget"] button:has-text("Set goal"), [data-test="swa-spa-checker-widget"] button:has-text("Save"), [data-test="swa-spa-checker-widget"] button:has-text("继续"), [data-test="swa-spa-checker-widget"] button:has-text("完成"), button:has-text("应用"), button:has-text("确认"), button:has-text("设置目标"), button:has-text("Apply"), button:has-text("Set goal")',
  /** 触发分析：工具栏可能在顶部，文案含「重新分析」 */
  analyzeAction:
    'button:has-text("获取推荐"), button:has-text("Get recommendations"), button:has-text("重新分析"), button:has-text("Re-analyze"), [role="button"]:has-text("获取推荐"), a:has-text("获取推荐")',
  getRecommendations:
    'button:has-text("获取推荐"), button:has-text("Get recommendations")',
  reAnalyze:
    'button:has-text("重新分析"), button:has-text("Re-analyze"), button:has-text("Reanalyze")',
  scoreBlock:
    '[class*="overall" i], [class*="score" i], [class*="rating" i], [data-test*="score" i]',
  /** SWA 右侧建议面板（结构稳定：data-test + aria-labelledby + role=listitem） */
  checkerWidget: '[data-test="swa-spa-checker-widget"]',
  suggestionSection: '[data-test="swa-spa-checker-widget"] section[aria-labelledby]',
  suggestionListItem: '[data-test="swa-spa-checker-widget"] [role="listitem"]',
  suggestionScrollContainer:
    '[data-test="swa-spa-checker-widget"] [data-ui-name="ScrollArea.Container"]',
} as const;
