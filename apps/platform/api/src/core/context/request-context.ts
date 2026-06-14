/**
 * 请求上下文：从 Guard 填充，Service 层使用。
 *
 * 边界：
 * - 不负责：JWT 解析（由 AuthGuard 处理，后期接入）
 */

export { RequestContext, Role } from '@wm/shared-core';
