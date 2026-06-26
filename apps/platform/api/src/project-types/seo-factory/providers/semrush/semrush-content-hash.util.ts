import { createHash } from 'node:crypto';

/** Stable hash for the exact markdown body submitted to Semrush RPA. */
export function hashSemrushContent(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}
