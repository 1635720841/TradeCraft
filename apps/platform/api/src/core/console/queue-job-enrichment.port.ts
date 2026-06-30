/**
 * Console 队列任务富化端口：由项目类型插件注册实现，平台层不直接查插件表。
 */

export interface QueueJobArticleEnrichment {
  id: string;
  targetKeyword: string | null;
  status: string | null;
  organizationId: string;
  projectId: string;
  workflowPhase: string | null;
}

export interface QueueJobEnrichmentPort {
  enrichArticleJobs(jobIds: string[]): Promise<Map<string, QueueJobArticleEnrichment>>;
}

let enrichmentPort: QueueJobEnrichmentPort | null = null;

export function registerQueueJobEnrichment(port: QueueJobEnrichmentPort): void {
  enrichmentPort = port;
}

export function getQueueJobEnrichment(): QueueJobEnrichmentPort | null {
  return enrichmentPort;
}
