/**
 * "Create an account" prompt on the booking-status page (portal docs/05 P13).
 *
 * Accounts are optional: the page works the same without one. The prompt is
 * only offered when the customer portal is configured (PORTAL_URL), the
 * booking isn't cancelled, no account exists for the booking's email yet, and
 * this traveller isn't already linked to one. It never carries booking data
 * into the sign-up form.
 */
export type AccountPrompt = { signUpUrl: string; signInUrl: string };

export function accountPromptDecision(input: {
  portalUrl: string | undefined;
  cancelled: boolean;
  bookingEmail: string;
  accountExists: boolean;
  travellerLinked: boolean;
}): AccountPrompt | null {
  const base = input.portalUrl?.trim().replace(/\/+$/, "");
  if (!base || !/^https?:\/\//.test(base)) return null;
  if (input.cancelled || !input.bookingEmail || input.accountExists || input.travellerLinked) return null;
  return { signUpUrl: `${base}/account/create`, signInUrl: `${base}/account/sign-in` };
}

export function isCancelledBooking(b: { bookingStatus?: unknown; reasonForCancellation?: unknown }): boolean {
  return (
    (typeof b.bookingStatus === "string" && /cancel/i.test(b.bookingStatus)) ||
    (typeof b.reasonForCancellation === "string" && b.reasonForCancellation.trim() !== "")
  );
}
