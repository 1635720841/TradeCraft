/**
 * 前端功能开关：未就绪能力默认关闭，避免产品面暴露半成品。
 *
 * WordPress CMS：后端 API 与 CmsPublishService 已实现。
 */
export const WORDPRESS_CMS_UI_ENABLED =
  import.meta.env.VITE_WORDPRESS_CMS_UI_ENABLED !== "false";
