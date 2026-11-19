/**
 * Plain-assert unit tests for the portal matching email on bookings.
 * Run with: npx ts-node --transpile-only src/booking-email-match.test.ts
 */
import assert from "node:assert";
import { emailForMatching, normalisedEmailChange } from "./booking-email-match";

// Same result as the portal's normaliseEmail for ordinary addresses.
assert.strictEqual(emailForMatching("  Alex.Johnson+Trips@Gmail.COM "), "alex.johnson+trips@gmail.com");
// Pasted invisible characters and non-breaking spaces go too.
assert.strictEqual(emailForMatching("​jane@Example.com﻿"), "jane@example.com");
assert.strictEqual(emailForMatching(" jane@example.com "), "jane@example.com");
assert.strictEqual(emailForMatching(undefined), "");
assert.strictEqual(emailForMatching(42), "");

// Missing → set it.
assert.strictEqual(normalisedEmailChange({ emailAddress: "Jane@Example.com " }), "jane@example.com");
// Already right → no write (this is what stops the trigger from looping).
assert.strictEqual(normalisedEmailChange({ emailAddress: "Jane@Example.com", emailAddressNormalised: "jane@example.com" }), undefined);
// Email edited → follow it.
assert.strictEqual(normalisedEmailChange({ emailAddress: "new@x.com", emailAddressNormalised: "old@x.com" }), "new@x.com");
// Legacy `email` field when emailAddress is empty.
assert.strictEqual(normalisedEmailChange({ emailAddress: " ", email: "Legacy@X.com" }), "legacy@x.com");
// Email removed → remove the field; nothing there → nothing to do.
assert.strictEqual(normalisedEmailChange({ emailAddress: "", emailAddressNormalised: "old@x.com" }), null);
assert.strictEqual(normalisedEmailChange({ emailAddress: "" }), undefined);

console.log("booking-email-match: all assertions passed");
