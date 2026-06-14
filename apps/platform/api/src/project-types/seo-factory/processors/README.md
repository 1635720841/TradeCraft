# BullMQ Processor 目录

队列命名：`seo-factory:article-job`

复制 article-job.processor.ts 模板（后期添加）时：

1. 实现幂等检查（traceId）
2. 调用 WorkflowService
3. 失败进 DLQ
