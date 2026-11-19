import { describe, expect, it } from "vitest";
import { addWorkingDays, parseDecision, planApproval } from "./account-claims-logic";

const open = { state: "open" as const, conflictType: "already_linked" as const, bookingDocumentId: "bookingDoc0123" };
const manual = { state: "open" as const, conflictType: "email_mismatch" as const, bookingDocumentId: null };

describe("addWorkingDays", () => {
  it("skips the weekend in Manila time", () => {
    // Thu 19 Nov 2026, 10:00 Manila → Mon 23 Nov, 10:00 Manila
    expect(addWorkingDays(new Date("2026-11-19T02:00:00Z"), 2).toISOString()).toBe("2026-11-23T02:00:00.000Z");
    // Fri 20 Nov 23:30 Manila (15:30Z) → Tue 24 Nov 23:30 Manila
    expect(addWorkingDays(new Date("2026-11-20T15:30:00Z"), 2).toISOString()).toBe("2026-11-24T15:30:00.000Z");
    // Sat 21 Nov 01:00 Manila (still Friday in UTC): the Manila day decides → Tue 24 Nov 01:00 Manila
    expect(addWorkingDays(new Date("2026-11-20T17:00:00Z"), 2).toISOString()).toBe("2026-11-23T17:00:00.000Z");
  });
});

describe("parseDecision", () => {
  it("accepts a valid approval and defaults to emailing the customer", () => {
    const r = parseDecision({ action: "approve", reasonCode: "previous_link_wrong", note: "  ok  ", revokeExisting: true }, open);
    expect(r).toEqual({
      ok: true,
      value: {
        action: "approve",
        reasonCode: "previous_link_wrong",
        note: "ok",
        bookingDocumentId: "bookingDoc0123",
        revokeExisting: true,
        emailCustomer: true,
      },
    });
  });

  it("rejects reasons that belong to another decision", () => {
    expect(parseDecision({ action: "reject", reasonCode: "evidence_matched" }, open)).toEqual({ ok: false, error: "Choose a reason" });
  });

  it("refuses to decide a resolved case or re-ask for evidence", () => {
    expect(parseDecision({ action: "reject", reasonCode: "duplicate_request" }, { ...open, state: "approved" })).toMatchObject({ ok: false });
    expect(
      parseDecision({ action: "needs_evidence", reasonCode: "evidence_requested" }, { ...open, state: "needs_evidence" }),
    ).toMatchObject({ ok: false });
    // …but a case waiting for evidence can still be approved or rejected.
    expect(
      parseDecision({ action: "reject", reasonCode: "evidence_insufficient" }, { ...open, state: "needs_evidence" }),
    ).toMatchObject({ ok: true });
  });

  it("needs a chosen booking to approve a manual check, and ignores one otherwise", () => {
    expect(parseDecision({ action: "approve", reasonCode: "same_person_other_email" }, manual)).toMatchObject({ ok: false });
    expect(
      parseDecision({ action: "approve", reasonCode: "same_person_other_email", bookingDocumentId: "x/../y" }, manual),
    ).toMatchObject({ ok: false });
    const ok = parseDecision({ action: "approve", reasonCode: "same_person_other_email", bookingDocumentId: "AbCdEf0123456" }, manual);
    expect(ok).toMatchObject({ ok: true, value: { bookingDocumentId: "AbCdEf0123456" } });
    // A booking-specific case can't be pointed at a different booking.
    const fixed = parseDecision({ action: "approve", reasonCode: "evidence_matched", bookingDocumentId: "Other0123456789" }, open);
    expect(fixed).toMatchObject({ ok: true, value: { bookingDocumentId: "bookingDoc0123" } });
  });

  it("only revokes on approval, and honours emailCustomer: false", () => {
    const r = parseDecision({ action: "reject", reasonCode: "not_the_traveller", revokeExisting: true, emailCustomer: false }, open);
    expect(r).toMatchObject({ ok: true, value: { revokeExisting: false, emailCustomer: false } });
  });

  it("caps the note length", () => {
    expect(parseDecision({ action: "reject", reasonCode: "duplicate_request", note: "x".repeat(2001) }, open)).toMatchObject({ ok: false });
  });
});

describe("planApproval", () => {
  it("links when nobody holds the traveller", () => {
    expect(planApproval(null, "me", false)).toEqual({ kind: "link" });
    expect(planApproval({ status: "revoked", userId: "other" }, "me", false)).toEqual({ kind: "link" });
  });

  it("is a no-op when the claimant already holds it", () => {
    expect(planApproval({ status: "active", userId: "me", linkId: "L1" }, "me", false)).toEqual({ kind: "already_linked" });
  });

  it("requires explicit confirmation to take it from another account", () => {
    expect(planApproval({ status: "active", userId: "other", linkId: "L1" }, "me", false)).toMatchObject({ kind: "error" });
    expect(planApproval({ status: "active", userId: "other", linkId: "L1" }, "me", true)).toEqual({
      kind: "revoke_and_link",
      previousUserId: "other",
      previousLinkId: "L1",
    });
  });
});
