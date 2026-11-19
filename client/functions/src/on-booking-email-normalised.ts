import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { normalisedEmailChange } from "./booking-email-match";

const db = getFirestore();

/**
 * Keeps `bookings.emailAddressNormalised` in step with the booking's email, so
 * the customer portal finds bookings whose address was typed with capitals,
 * spaces or pasted invisible characters.
 *
 * A trigger rather than a change to each write path: bookings are created and
 * edited by the reservation form, staff routes, the booking sheet, Stripe
 * handlers, Cloud Functions and scripts.
 *
 * Safe with the other bookings triggers: they all act on a before→after change
 * of their own field (generateEmailDraft, sendEmail, paymentProgress, …), so
 * this write only makes them start and return. It can't loop: the second
 * invocation sees the field already matches and does nothing.
 */
export const onBookingEmailNormalised = onDocumentWritten(
  {
    document: "bookings/{bookingId}",
    region: "asia-southeast1",
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return; // deleted
    const change = normalisedEmailChange(after.data() ?? {});
    if (change === undefined) return;

    try {
      // Only if the doc hasn't changed since this event, so a newer email edit
      // is never overwritten with an older value; that edit fires its own event.
      await db
        .collection("bookings")
        .doc(event.params.bookingId)
        .update(
          { emailAddressNormalised: change ?? FieldValue.delete() },
          { lastUpdateTime: after.updateTime },
        );
    } catch (error) {
      const code = (error as { code?: number }).code;
      if (code === 9 || code === 5) return; // FAILED_PRECONDITION (newer write) or NOT_FOUND (deleted)
      logger.error(`emailAddressNormalised update failed for ${event.params.bookingId}`, error);
    }
  },
);
