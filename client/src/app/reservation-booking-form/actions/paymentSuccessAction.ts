import {
  confirmReservationPayment,
  getReservation,
} from "../api/reservationsApi";

/** The reservation fee that was paid, for analytics (GA4 value + currency). */
export type ConfirmedPayment = { amount?: number; currency?: string };

type PaymentSuccessActionInput = {
  paymentIntentId?: string;
  paymentDocId?: string;
  email: string;
  tourPackage: string;
  completedSteps: number[];
  setCompletedSteps: (
    update: number[] | ((prev: number[]) => number[]),
  ) => void;
  setPaymentConfirmed: (value: boolean) => void;
  setBookingId: (value: string) => void;
  onError: (error: unknown) => void;
  /** Called once the reservation fee is confirmed (and not refunded). */
  onConfirmed?: (paymentDocId?: string, payment?: ConfirmedPayment) => void;
  /** Test seam: how long to wait for the webhook's booking, and how often to look. */
  bookingWait?: { timeoutMs: number; intervalMs: number };
};

/** The payment went through after its held slots had gone, and was refunded. */
export const SALE_CONFLICT_ERROR = "sale_conflict";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Polls the reservation until the webhook has created its booking. Returns
 * "" when a sale payment was refunded because its slots had gone: no booking
 * will come, so there is nothing to wait for.
 */
async function waitForBookingId(
  paymentDocId: string,
  { timeoutMs, intervalMs }: { timeoutMs: number; intervalMs: number },
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const reservation = await getReservation(paymentDocId).catch(() => null);
    if (reservation?.sale?.conflict) return "";
    const bookingId = reservation?.booking?.id;
    if (bookingId && bookingId !== "PENDING" && reservation?.booking?.documentId) {
      return bookingId;
    }
    await sleep(intervalMs);
  }
  return null;
}

export const runPaymentSuccessAction = async ({
  paymentIntentId,
  paymentDocId,
  email,
  tourPackage,
  completedSteps,
  setCompletedSteps,
  setPaymentConfirmed,
  setBookingId,
  onError,
  onConfirmed,
  bookingWait = { timeoutMs: 30000, intervalMs: 1500 },
}: PaymentSuccessActionInput): Promise<void> => {
  try {
    // The server checks the payment with Stripe and records "reserve_paid";
    // the browser no longer writes the status or the intent id itself.
    let actualPaymentDocId = paymentDocId;
    if (paymentIntentId) {
      try {
        const confirmed = await confirmReservationPayment(paymentIntentId, paymentDocId);
        actualPaymentDocId = confirmed.paymentDocId;
      } catch (error) {
        // The webhook records the payment too; don't block the customer.
        console.error("Payment confirmation check failed:", error);
      }
    }

    if (actualPaymentDocId && process.env.NEXT_PUBLIC_ENV !== "production") {
      const response = await fetch("/api/stripe-payments/create-booking", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          paymentDocId: actualPaymentDocId,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        setBookingId(result.bookingId);
      }
    } else if (
      actualPaymentDocId &&
      process.env.NEXT_PUBLIC_ENV === "production"
    ) {
      // Preserve current behavior: continue even if the webhook wait times out.
      const createdBookingId = await waitForBookingId(actualPaymentDocId, bookingWait);
      if (createdBookingId) {
        setBookingId(createdBookingId);
      }
    }

    let paid: ConfirmedPayment | undefined;
    if (actualPaymentDocId) {
      const finalReservation = await getReservation(actualPaymentDocId).catch(() => null);
      paid = finalReservation?.payment;
      if (finalReservation?.sale?.conflict) {
        onError(new Error(SALE_CONFLICT_ERROR));
        return;
      }
    }

    try {
      const sessionKey = `stripe_payment_${email}_${tourPackage}`;
      sessionStorage.removeItem(sessionKey);
      const guestsSessionKey = `additional_guests_${email}_${tourPackage}`;
      sessionStorage.removeItem(guestsSessionKey);
    } catch {}

    setPaymentConfirmed(true);
    onConfirmed?.(actualPaymentDocId, paid);
    if (!completedSteps.includes(1)) {
      setCompletedSteps((prev) => [...prev, 1]);
    }
    if (!completedSteps.includes(2)) {
      setCompletedSteps((prev) => [...prev, 2]);
    }
  } catch (error) {
    onError(error);
  }
};
