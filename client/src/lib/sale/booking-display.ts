type SaleBookingFields = {
  saleName?: string | null;
  saleDiscountGBP?: number | null;
  originalTourCost?: number | string | null;
  discountedTourCost?: number | string | null;
};

/**
 * What a sale booking shows in the Discounts columns. Those columns are worked
 * out from discountEvents, which doesn't hold sales, so they stay empty here and
 * the sale stored on the booking fills them in. Null for every other booking.
 */
export function saleColumnValue(booking: SaleBookingFields, columnId: string): string | null {
  if (!booking.saleName) return null;
  if (columnId === "eventName") return booking.saleName;
  if (columnId === "discountType") return "Flat amount";
  if (columnId !== "discountRate") return null;

  const discount =
    Number(booking.saleDiscountGBP) ||
    Number(booking.originalTourCost) - Number(booking.discountedTourCost);
  return discount > 0 ? `£${Math.round(discount)} off` : null;
}

/** Discounted tour cost of a sale booking: tour price less the slot discount. */
export function saleDiscountedCost(originalTourCost: unknown, discountGBP: unknown): number | null {
  const original = Number(originalTourCost);
  const discount = Number(discountGBP);
  if (!(original > 0) || !(discount > 0) || discount > original) return null;
  return Math.round((original - discount) * 100) / 100;
}
