type PaymentDoc = {
  booking?: { documentId?: string; isGuest?: boolean };
  payment?: { type?: string };
};

const linkedBooking = (data: PaymentDoc | undefined) => {
  const id = data?.booking?.documentId;
  return id && id !== "PENDING" ? id : null;
};

/**
 * The booking to confirm when a reservation fee payment gets its booking, else
 * null. Only that first link counts, so edits to an older payment can never
 * email a past customer. A guest paying for themselves is confirmed by
 * /guest-reservation.
 */
export function bookingToConfirm(
  before: PaymentDoc | undefined,
  after: PaymentDoc | undefined,
): string | null {
  if (linkedBooking(before)) return null;
  if (after?.payment?.type !== "reservationFee") return null;
  if (after.booking?.isGuest === true) return null;
  return linkedBooking(after);
}
