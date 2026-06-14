/**
 * 外部服务防腐层接口定义：LLM、SERP、配图、SEO 查分。
 *
 * 边界：
 * - 不负责：具体厂商实现（由各 project-type 的 providers/ 实现）
 *
 * 入口：
 * - ILLMProvider, ISerpProvider, IImageProvider, ISeoCheckerProvider
 */

export * from './llm-provider.interface';
export * from './serp-provider.interface';
export * from './image-provider.interface';
export * from './seo-checker-provider.interface';
export * from './keyword-metrics-provider.interface';
export * from './paraphrase-provider.interface';
export * from './provider.tokens';
