/**
 * Plain-assert unit tests for payment plan reminder timing.
 * Run with: npx ts-node --transpile-only src/plan-reminders.test.ts
 */
import assert from "node:assert";
import { LAST_MINUTE_TERM, needsPlanReminder, nextReminderCount, plansOffered, reminderTimes } from "./plan-reminders";

const HOUR = 3600000;
const DAY = 24 * HOUR;
const reserved = Date.parse("2026-11-03T00:00:00Z");
const days = (times: number[]) => times.map((t) => Math.round((t - reserved) / DAY));
const tour = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

assert.strictEqual(plansOffered("P3"), 3);
assert.strictEqual(plansOffered(LAST_MINUTE_TERM), 0);
assert.strictEqual(plansOffered("Invalid"), 0);

// Last minute: within the 48-hour window.
assert.deepStrictEqual(
  reminderTimes(LAST_MINUTE_TERM, reserved, tour("2026-12-01")).map((t) => (t - reserved) / HOUR),
  [6, 24],
);

// Short window, one plan: two reminders spread across what's left.
assert.deepStrictEqual(days(reminderTimes("P1", reserved, tour("2027-01-31"))), [1, 10]);

// Mid window: three reminders, evenly spaced.
assert.deepStrictEqual(days(reminderTimes("P2", reserved, tour("2027-03-01"))), [1, 15, 29]);

// Long window: four reminders, never more than 14 days apart.
const long = days(reminderTimes("P4", reserved, tour("2027-11-01")));
assert.deepStrictEqual(long, [1, 15, 29, 43]);

// Nothing lands after the deadline.
const tight = reminderTimes("P1", reserved, tour("2027-01-04"));
assert.ok(tight.every((t) => t < Date.parse("2026-11-04T00:00:01Z")));

// Terms with nothing to choose get no reminders.
assert.deepStrictEqual(reminderTimes("Invalid", reserved, tour("2027-06-01")), []);
assert.deepStrictEqual(reminderTimes("", reserved, tour("2027-06-01")), []);

// One email per step, and a missed run doesn't send a burst.
const times = [100, 200, 300];
assert.strictEqual(nextReminderCount(times, 0, 50), null);
assert.strictEqual(nextReminderCount(times, 0, 100), 1);
assert.strictEqual(nextReminderCount(times, 1, 150), null);
assert.strictEqual(nextReminderCount(times, 0, 250), 2);
assert.strictEqual(nextReminderCount(times, 3, 999), null);

// Who qualifies.
const booking = { access_token: "t", emailAddress: "a@b.c", sourcePaymentDocId: "p" };
assert.strictEqual(needsPlanReminder(booking), true);
assert.strictEqual(needsPlanReminder({ ...booking, paymentPlan: "P2" }), false);
assert.strictEqual(needsPlanReminder({ ...booking, reasonForCancellation: "Guest cancelled" }), false);
assert.strictEqual(needsPlanReminder({ ...booking, bookingStatus: "Cancelled" }), false);
assert.strictEqual(needsPlanReminder({ ...booking, sourcePaymentDocId: "" }), false);
assert.strictEqual(needsPlanReminder({ ...booking, access_token: "" }), false);

console.log("plan-reminders: all assertions passed");
