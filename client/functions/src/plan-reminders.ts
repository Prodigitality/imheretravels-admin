// When to remind a traveller who has paid their reservation fee but not chosen a
// payment plan. Pure, so the timing can be tested without Firestore.
//
// The timing follows the plans on offer and the time left before the balance is
// due, so a tour next week and a tour next year don't get the same emails.

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const MAX_SPACING = 14 * DAY;

export const LAST_MINUTE_TERM = "Full payment required within 48hrs";

/** More plans means more time to decide, so more reminders fit. */
const REMINDERS_BY_PLANS: Record<number, number> = { 1: 2, 2: 3, 3: 3, 4: 4 };

/** Bookings before this are left alone: reminders are for new customers only. */
export const REMINDERS_START_MS = Date.parse("2026-11-03T00:00:00Z");

/** How many instalment plans a term offers: "P3" → 3. 0 when it offers none. */
export function plansOffered(term: unknown): number {
  const match = /^P([1-4])$/.exec(String(term ?? ""));
  return match ? Number(match[1]) : 0;
}

/** The balance is due two calendar months before the tour. */
function finalDeadlineMs(tourMs: number): number {
  const d = new Date(tourMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 2, d.getUTCDate());
}

/** When each reminder is due, soonest first. Empty when the term has none. */
export function reminderTimes(term: unknown, reservationMs: number, tourMs: number): number[] {
  if (term === LAST_MINUTE_TERM) {
    return [reservationMs + 6 * HOUR, reservationMs + 24 * HOUR];
  }

  const plans = plansOffered(term);
  if (!plans) return [];

  const deadline = finalDeadlineMs(tourMs);
  const count = REMINDERS_BY_PLANS[plans];
  const spacing = Math.max(DAY, Math.min(MAX_SPACING, (deadline - reservationMs) / (count + 1)));

  return Array.from({ length: count }, (_, i) => reservationMs + DAY + i * spacing).filter((t) => t < deadline);
}

/**
 * How many reminders should have gone out by now, or null when none is due.
 * A run that was missed sends one email and skips the ones it passed, so nobody
 * gets several at once.
 */
export function nextReminderCount(times: number[], sentCount: number, nowMs: number): number | null {
  const dueCount = times.filter((t) => t <= nowMs).length;
  return dueCount > sentCount ? dueCount : null;
}

type BookingFacts = {
  paymentPlan?: unknown;
  reasonForCancellation?: unknown;
  bookingStatus?: unknown;
  access_token?: unknown;
  emailAddress?: unknown;
  sourcePaymentDocId?: unknown;
};

/** Paid through the form, still needs a plan, and can be reached. */
export function needsPlanReminder(booking: BookingFacts): boolean {
  if (String(booking.paymentPlan ?? "").trim()) return false;
  if (String(booking.reasonForCancellation ?? "").trim()) return false;
  if (/cancel|elapsed/i.test(String(booking.bookingStatus ?? ""))) return false;
  return !!booking.access_token && !!booking.emailAddress && !!booking.sourcePaymentDocId;
}
