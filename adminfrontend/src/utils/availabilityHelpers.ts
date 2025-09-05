import type { BlockedDate } from '../types';

export function getBlockedDatesCount(
  blockedDates: BlockedDate[],
  productId: string
): number {
  return blockedDates.filter(b => b.productId === productId && b.isActive === false).length;
}


export function isDateBlocked(
  blockedDates: BlockedDate[],
  productId: string,
  date: string
): boolean {
  return blockedDates.some(b =>
    b.productId === productId &&
    b.date.slice(0, 10) === date &&
    b.isActive === false
  );
}