/**
 * `bookings.emailAddressNormalised`: the booking's email in the form the
 * customer portal matches on when a signed-in customer looks for their
 * bookings (portal docs/02-data-model.md, 05 §8.2).
 *
 * Rule: drop invisible characters, trim, lowercase. Nothing else: dots and
 * plus-tags stay, because stripping them would merge addresses that belong to
 * different people. The portal normalises the customer's verified email the
 * same way (trim + lowercase), so the two compare equal.
 *
 * `emailAddress` itself keeps its original case (stripePayments and scheduled
 * emails are matched against it as typed).
 */

// Zero-width space/joiners, word joiner and BOM: trim() leaves them in place.
const INVISIBLE_CHARS = /[​-‍⁠﻿]/g;

export function emailForMatching(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(INVISIBLE_CHARS, "").trim().toLowerCase();
}

/**
 * What `emailAddressNormalised` should be changed to for this booking, or
 * `undefined` when it's already right. `null` means "remove the field" (the
 * booking no longer has an email). Reads `emailAddress`, then the legacy
 * `email` field.
 */
export function normalisedEmailChange(booking: Record<string, unknown>): string | null | undefined {
  const want = emailForMatching(booking.emailAddress) || emailForMatching(booking.email);
  const have = booking.emailAddressNormalised;
  if (want) return have === want ? undefined : want;
  return have === undefined ? undefined : null;
}
