/**
 * Plain-assert unit tests for the rule that fires Reservation Confirmed.
 * Run with: npx ts-node src/reservation-paid.test.ts
 */
import assert from "node:assert";
import { bookingToConfirm } from "./reservation-paid";

const pending = { booking: { documentId: "PENDING" }, payment: { type: "reservationFee" } };
const linked = { booking: { documentId: "b1" }, payment: { type: "reservationFee" } };

// Confirms when a reservation fee payment first gets its booking.
assert.strictEqual(bookingToConfirm(pending, linked), "b1");
assert.strictEqual(bookingToConfirm({ payment: { type: "reservationFee" } }, linked), "b1");

// Never fires for a payment that already had its booking.
assert.strictEqual(bookingToConfirm(linked, linked), null);
assert.strictEqual(bookingToConfirm(linked, { ...linked, booking: { documentId: "b2" } }), null);

// Waits until the booking exists.
assert.strictEqual(bookingToConfirm(pending, pending), null);
assert.strictEqual(bookingToConfirm(pending, { payment: { type: "reservationFee" } }), null);

// Skips other payments and guests who pay for themselves.
assert.strictEqual(bookingToConfirm(pending, { ...linked, payment: { type: "installment" } }), null);
assert.strictEqual(bookingToConfirm(pending, { ...linked, booking: { documentId: "b1", isGuest: true } }), null);

console.log("reservation-paid: all assertions passed");
