import { describe, expect, it } from "vitest";
import { BOOKING_CONFIRMED_PATH, bookingConfirmedUrl } from "./bookingConfirmedUrl";

describe("bookingConfirmedUrl", () => {
  it("keeps the form's query and sets the payment id", () => {
    expect(bookingConfirmedUrl("?tour=argentina&tourdate=2027-01-01", "pay123")).toBe(
      `${BOOKING_CONFIRMED_PATH}?tour=argentina&tourdate=2027-01-01&paymentid=pay123`,
    );
  });

  it("replaces an existing payment id", () => {
    expect(bookingConfirmedUrl("?paymentid=old", "new")).toBe(`${BOOKING_CONFIRMED_PATH}?paymentid=new`);
  });

  it("works without a query or payment id", () => {
    expect(bookingConfirmedUrl("", undefined)).toBe(BOOKING_CONFIRMED_PATH);
  });
});
