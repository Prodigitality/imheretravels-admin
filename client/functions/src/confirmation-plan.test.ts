/**
 * Plain-assert unit tests for the Reservation Confirmed plan fields.
 * Run with: npx ts-node src/confirmation-plan.test.ts
 */
import assert from "node:assert";
import { confirmationPlanFields } from "./confirmation-plan";
import { LAST_MINUTE_TERM } from "./plan-reminders";

// Last-minute booking, no plan yet: full payment, no prompt to choose a plan.
assert.deepStrictEqual(confirmationPlanFields({ availablePaymentTerms: LAST_MINUTE_TERM, paymentPlan: "" }), {
  isLastMinute: true,
  paymentPlan: "Full Payment",
  needsPaymentPlan: false,
});

// Plans available, none chosen yet: prompt to choose.
assert.deepStrictEqual(confirmationPlanFields({ availablePaymentTerms: "P3", paymentPlan: "" }), {
  isLastMinute: false,
  paymentPlan: "",
  needsPaymentPlan: true,
});

// A chosen plan is shown as is, last-minute or not.
assert.deepStrictEqual(confirmationPlanFields({ availablePaymentTerms: "P2", paymentPlan: "P2" }), {
  isLastMinute: false,
  paymentPlan: "P2",
  needsPaymentPlan: false,
});
assert.strictEqual(
  confirmationPlanFields({ availablePaymentTerms: LAST_MINUTE_TERM, paymentPlan: "Full Payment" }).paymentPlan,
  "Full Payment",
);

// Missing fields behave like before: no plan chosen, prompt shown.
assert.deepStrictEqual(confirmationPlanFields({}), { isLastMinute: false, paymentPlan: "", needsPaymentPlan: true });

console.log("confirmation-plan tests passed");
