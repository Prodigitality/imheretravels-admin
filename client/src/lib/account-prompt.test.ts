import { describe, expect, it } from "vitest";
import { accountPromptDecision, isCancelledBooking } from "./account-prompt";

const base = {
  portalUrl: "https://portal.example.com/",
  cancelled: false,
  bookingEmail: "jane@example.com",
  accountExists: false,
  travellerLinked: false,
};

describe("accountPromptDecision", () => {
  it("offers sign-up and sign-in links, with no booking data in them", () => {
    const p = accountPromptDecision(base);
    expect(p).toEqual({
      signUpUrl: "https://portal.example.com/account/create",
      signInUrl: "https://portal.example.com/account/sign-in",
    });
    expect(JSON.stringify(p)).not.toContain("jane");
  });

  it("stays hidden until the portal is configured", () => {
    expect(accountPromptDecision({ ...base, portalUrl: undefined })).toBeNull();
    expect(accountPromptDecision({ ...base, portalUrl: "  " })).toBeNull();
    expect(accountPromptDecision({ ...base, portalUrl: "javascript:alert(1)" })).toBeNull();
  });

  it("never shows once there's an account, a link, or the booking is cancelled", () => {
    expect(accountPromptDecision({ ...base, accountExists: true })).toBeNull();
    expect(accountPromptDecision({ ...base, travellerLinked: true })).toBeNull();
    expect(accountPromptDecision({ ...base, cancelled: true })).toBeNull();
    expect(accountPromptDecision({ ...base, bookingEmail: "" })).toBeNull();
  });
});

describe("isCancelledBooking", () => {
  it("reads either the status or a cancellation reason", () => {
    expect(isCancelledBooking({ bookingStatus: "Cancelled" })).toBe(true);
    expect(isCancelledBooking({ bookingStatus: "Installment 1/3", reasonForCancellation: "Changed plans" })).toBe(true);
    expect(isCancelledBooking({ bookingStatus: "Confirmed", reasonForCancellation: "  " })).toBe(false);
    expect(isCancelledBooking({})).toBe(false);
  });
});
