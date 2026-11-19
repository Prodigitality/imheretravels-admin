import "server-only";

import { adminDb } from "@/lib/firebase-admin-db";
import { accountPromptDecision, isCancelledBooking, type AccountPrompt } from "@/lib/account-prompt";
import { emailForMatching } from "../../functions/src/booking-email-match";

/**
 * Whether the booking-status page should offer a customer-portal account.
 * Reads the customer collections through firebase-admin (they're closed to
 * browsers). Any failure hides the prompt: it must never break the page.
 */
export async function accountPromptFor(
  bookingDocumentId: string,
  booking: Record<string, unknown>,
): Promise<AccountPrompt | null> {
  const portalUrl = process.env.PORTAL_URL;
  const bookingEmail = emailForMatching(booking.emailAddress) || emailForMatching(booking.email);
  const cheap = accountPromptDecision({
    portalUrl,
    cancelled: isCancelledBooking(booking),
    bookingEmail,
    accountExists: false,
    travellerLinked: false,
  });
  if (!cheap) return null; // portal off, cancelled or no email: skip the lookups

  try {
    const db = adminDb();
    const [accounts, guard] = await Promise.all([
      db.collection("customerAccounts").where("primaryEmailNormalised", "==", bookingEmail).limit(1).get(),
      db.collection("bookingLinkGuards").doc(bookingDocumentId).get(),
    ]);
    return accountPromptDecision({
      portalUrl,
      cancelled: false,
      bookingEmail,
      accountExists: !accounts.empty,
      travellerLinked: guard.exists && guard.get("status") === "active",
    });
  } catch (error) {
    console.error("[booking-status] account prompt lookup failed", error);
    return null;
  }
}
