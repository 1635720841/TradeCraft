/**
 * 项目内全局搜索 Port：各 project-type 提供任务/站点等资源检索。
 */

export interface ProjectSearchContext {
  organizationId: string;
  userId: string;
}

export interface ProjectSearchHit {
  id: string;
  title: string;
  subtitle?: string;
  path: string;
}

export interface ProjectSearchGroup {
  type: 'job' | 'site' | 'demo' | string;
  label: string;
  items: ProjectSearchHit[];
}

export interface ProjectSearchPort {
  readonly projectType: string;
  searchInProjects(
    ctx: ProjectSearchContext,
    query: string,
    projectIds: string[],
    limit: number,
  ): Promise<ProjectSearchGroup[]>;
}
