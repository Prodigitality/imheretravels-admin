import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { bookingToConfirm } from "./reservation-paid";
import { sendReservationConfirmed } from "./send-booking-status-confirmation";

const db = getFirestore();

/**
 * Sends Reservation Confirmed as soon as a paid reservation has its booking, so
 * customers hear from us even if they leave before choosing a payment plan. A
 * trigger, not the Stripe webhook: sending can outlast the webhook's time limit.
 */
export const onReservationPaid = onDocumentUpdated(
  {
    document: "stripePayments/{paymentId}",
    region: "asia-southeast1",
    timeoutSeconds: 540,
    memory: "1GiB",
  },
  async (event) => {
    const bookingDocumentId = bookingToConfirm(
      event.data?.before.data(),
      event.data?.after.data(),
    );
    if (!bookingDocumentId) return;

    try {
      const bookingDoc = await db
        .collection("bookings")
        .doc(bookingDocumentId)
        .get();
      if (!bookingDoc.exists) {
        logger.error(`Booking ${bookingDocumentId} not found`);
        return;
      }
      const { sent, failed } = await sendReservationConfirmed(bookingDoc);
      logger.info(
        `📧 Reservation Confirmed for ${bookingDocumentId}: ${sent.length} sent, ${failed.length} failed`,
      );
    } catch (error) {
      // Step 3 tries again if the customer gets that far.
      logger.error(
        `❌ Reservation Confirmed failed for ${bookingDocumentId}:`,
        error,
      );
    }
  },
);
