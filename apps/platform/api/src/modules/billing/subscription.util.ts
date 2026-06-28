/**
 * 订阅账期工具。
 */

export function assertValidPeriodRange(start: Date, end: Date): void {
  if (end.getTime() <= start.getTime()) {
    throw new Error('账期结束时间必须晚于开始时间');
  }
}

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

export function addYears(date: Date, years: number): Date {
  const result = new Date(date);
  result.setFullYear(result.getFullYear() + years);
  return result;
}

export function resolveNextPeriodEnd(start: Date, cycle: 'MONTHLY' | 'YEARLY'): Date {
  return cycle === 'YEARLY' ? addYears(start, 1) : addMonths(start, 1);
}

export function daysRemaining(end: Date): number {
  const now = Date.now();
  const diff = end.getTime() - now;
  return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
}

export function isSubscriptionActive(
  status: string,
  periodEnd: Date | null | undefined,
): boolean {
  if (status === 'CANCELLED' || status === 'EXPIRED') {
    return false;
  }
  if (!periodEnd) {
    return status === 'ACTIVE' || status === 'TRIAL';
  }
  return periodEnd.getTime() > Date.now();
}
