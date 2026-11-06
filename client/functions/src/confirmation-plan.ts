import { LAST_MINUTE_TERM } from "./plan-reminders";

/**
 * Payment-plan fields for the Reservation Confirmed email.
 *
 * A booking made less than two months before the tour has no plan to choose:
 * the full balance is due within 48 hours (`availablePaymentTerms` is
 * LAST_MINUTE_TERM). Such an email must not ask the customer to choose a plan
 * or quote a "final payment deadline" two months before departure, which is
 * already in the past.
 */
export function confirmationPlanFields(booking: {
  paymentPlan?: unknown;
  availablePaymentTerms?: unknown;
}): { isLastMinute: boolean; paymentPlan: string; needsPaymentPlan: boolean } {
  const isLastMinute = String(booking.availablePaymentTerms ?? "") === LAST_MINUTE_TERM;
  const chosen = String(booking.paymentPlan ?? "").trim();
  return {
    isLastMinute,
    paymentPlan: chosen || (isLastMinute ? "Full Payment" : ""),
    needsPaymentPlan: !chosen && !isLastMinute,
  };
}
