/**
 * 项目搜索 Port 注册表。
 */

import type { ProjectSearchPort } from '@wm/platform-sdk';

const ports = new Map<string, ProjectSearchPort>();

export function registerProjectSearchPort(port: ProjectSearchPort): void {
  ports.set(port.projectType, port);
}

export function getProjectSearchPort(projectType: string): ProjectSearchPort | undefined {
  return ports.get(projectType);
}

export function listProjectSearchPorts(): ProjectSearchPort[] {
  return [...ports.values()];
}
