/**
 * The ad team counts a booking when the browser reaches
 * /reservation-booking-form/booking-confirmed (Meta pixel PageView via GTM's
 * History Change trigger, which listens for pushState).
 *
 * The customer stays on the same form (step 3 still has to pick a payment
 * plan), so the address bar moves with history.pushState at the moment the
 * reservation fee is confirmed, once per payment per tab, and dataLayer gets
 * `reservation_confirmed` {payment_id}. next.config.ts makes
 * the address safe: in-app navigations to it render the form, and a full load
 * (refresh, shared link) redirects to the plain form URL so it can't count
 * the same booking twice.
 */

export const FORM_PATH = "/reservation-booking-form";
export const BOOKING_CONFIRMED_PATH = `${FORM_PATH}/booking-confirmed`;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function bookingConfirmedUrl(search: string, paymentDocId?: string): string {
  const params = new URLSearchParams(search);
  if (paymentDocId) params.set("paymentid", paymentDocId);
  const qs = params.toString();
  return qs ? `${BOOKING_CONFIRMED_PATH}?${qs}` : BOOKING_CONFIRMED_PATH;
}

/** Returns true when the address bar was moved (false: already done for this payment). */
export function markBookingConfirmed(
  paymentDocId: string | undefined,
  storage: StorageLike | null = typeof window !== "undefined" ? window.sessionStorage : null,
): boolean {
  if (typeof window === "undefined") return false;
  const key = `iht_booking_confirmed_${paymentDocId ?? "unknown"}`;
  try {
    if (storage?.getItem(key)) return false;
    storage?.setItem(key, "1");
  } catch {
    // Storage blocked: still mark this one.
  }
  try {
    window.history.pushState(window.history.state, "", bookingConfirmedUrl(window.location.search, paymentDocId));
  } catch {
    return false;
  }
  const w = window as unknown as { dataLayer?: unknown[] };
  // "Reservation" (fee paid), not "booking" (tour fully paid). The URL keeps
  // the ad agency's /booking-confirmed name.
  (w.dataLayer = w.dataLayer || []).push({ event: "reservation_confirmed", payment_id: paymentDocId ?? "" });
  return true;
}
