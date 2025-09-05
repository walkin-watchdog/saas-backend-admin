import type { Product, ProductAvailabilitySubrange, AvailabilityStatus, BlockedDate } from '@prisma/client';

export function computeStatus(
  prod: Pick<Product,
    'availabilityStartDate'|'availabilityEndDate'|'permanentAvailabilityStatus'
  > & {
    availabilitySubranges: ProductAvailabilitySubrange[];
    blockedDates?: BlockedDate[];
  },
  referenceDate: Date = new Date()
): { status: AvailabilityStatus; nextAvailableDate: Date | null } {
  const today = referenceDate;

  if (prod.permanentAvailabilityStatus) {
    return { status: prod.permanentAvailabilityStatus, nextAvailableDate: null };
  }

  if (!prod.availabilityStartDate) {
    throw new Error('availabilityStartDate is required');
  }
  const start = new Date(prod.availabilityStartDate);
  const end   = prod.availabilityEndDate ? new Date(prod.availabilityEndDate) : null;
  if (today < start || (end && today > end)) {
    return { status: 'NOT_OPERATING', nextAvailableDate: null };
  }

  const inSold = prod.availabilitySubranges.some(r =>
    r.status === 'SOLD_OUT' &&
    today >= r.startDate &&
    today <= r.endDate
  );
  const activeBlockedDates = prod.blockedDates
    ? prod.blockedDates.filter(d => d.isActive === false).map(d => d.date)
    : [];
  const inNotOp = !inSold && (
    prod.availabilitySubranges.some(r =>
      r.status === 'NOT_OPERATING' &&
      today >= r.startDate &&
      today <= r.endDate
    ) ||
    activeBlockedDates.some(d =>
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate()
    )
  );

  const status: AvailabilityStatus = inSold ? 'SOLD_OUT'
                                         : inNotOp ? 'NOT_OPERATING'
                                                   : 'AVAILABLE';

  let look = new Date(today);
  for (let i = 0; i < 365; i++) {
    const blocked = prod.availabilitySubranges.some(r =>
      look >= r.startDate && look <= r.endDate
    ) || activeBlockedDates.some(d =>
      d.getFullYear() === look.getFullYear() &&
      d.getMonth() === look.getMonth() &&
      d.getDate() === look.getDate()
    );
    if (!blocked && look >= start && (!end || look <= end)) {
      return { status, nextAvailableDate: look };
    }
    look.setDate(look.getDate() + 1);
  }

  return { status, nextAvailableDate: null };
}