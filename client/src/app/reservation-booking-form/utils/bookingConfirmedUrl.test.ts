import { afterEach, describe, expect, it, vi } from "vitest";
import { BOOKING_CONFIRMED_PATH, bookingConfirmedUrl, markBookingConfirmed } from "./bookingConfirmedUrl";

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

describe("markBookingConfirmed", () => {
  const setup = () => {
    const dataLayer: Record<string, unknown>[] = [];
    const pushState = vi.fn();
    vi.stubGlobal("window", { location: { search: "?tour=test-tour" }, history: { state: null, pushState }, dataLayer });
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    return { dataLayer, pushState, storage };
  };
  afterEach(() => vi.unstubAllGlobals());

  it("pushes the paid fee as GA4 value with its currency", () => {
    const { dataLayer, pushState, storage } = setup();
    expect(markBookingConfirmed("pay1", { amount: 250, currency: "gbp", bookingId: "SB-TT-20261201-JG001" }, storage)).toBe(true);
    expect(pushState).toHaveBeenCalledWith(null, "", `${BOOKING_CONFIRMED_PATH}?tour=test-tour&paymentid=pay1`);
    expect(dataLayer).toEqual([
      {
        event: "reservation_confirmed",
        payment_record_id: "pay1",
        payment_id: "pay1",
        booking_id: "SB-TT-20261201-JG001",
        currency: "GBP",
        value: 250,
      },
    ]);
  });

  it("still sends GBP (and no value) when the amount is unknown", () => {
    const { dataLayer, storage } = setup();
    markBookingConfirmed("pay2", undefined, storage);
    expect(dataLayer).toEqual([
      { event: "reservation_confirmed", payment_record_id: "pay2", payment_id: "pay2", currency: "GBP" },
    ]);
  });

  it("fires once per payment", () => {
    const { dataLayer, storage } = setup();
    markBookingConfirmed("pay3", { amount: 0.3 }, storage);
    expect(markBookingConfirmed("pay3", { amount: 0.3 }, storage)).toBe(false);
    expect(dataLayer).toHaveLength(1);
  });
});
