/**
 * Console 站点富化 Port 注册表。
 */

import type { ConsoleSiteEnrichmentPort } from '@wm/platform-sdk';

const ports = new Map<string, ConsoleSiteEnrichmentPort>();

export function registerConsoleSiteEnrichmentPort(port: ConsoleSiteEnrichmentPort): void {
  ports.set(port.projectType, port);
}

export function getConsoleSiteEnrichmentPort(
  projectType: string,
): ConsoleSiteEnrichmentPort | undefined {
  return ports.get(projectType);
}

export function listConsoleSiteEnrichmentPorts(): ConsoleSiteEnrichmentPort[] {
  return [...ports.values()];
}
