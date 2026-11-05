import { describe, expect, it, vi } from "vitest";

const getReservationMock = vi.fn(async (_id: string) => ({
  id: "doc-1",
  bookingDocumentIds: ["booking-doc-1"],
}));
vi.mock("../api/reservationsApi", () => ({ getReservation: getReservationMock }));

const { runConfirmBookingAction } = await import("./confirmBookingAction");

describe("runConfirmBookingAction", () => {
  it("alerts and returns early when plans are incomplete", async () => {
    const onAlert = vi.fn();
    const setConfirmingBooking = vi.fn();

    await runConfirmBookingAction({
      paymentConfirmed: true,
      isLastMinute: false,
      allPlansSelected: false,
      numberOfPeople: 2,
      paymentPlans: [],
      availablePaymentPlans: [],
      bookingId: "",
      paymentDocId: "doc-1",
      email: "a@x.com",
      tourPackage: "tour-1",
      setConfirmingBooking,
      setFetchedPaymentPlanLabel: vi.fn(),
      setBookingConfirmed: vi.fn(),
      onAlert,
      onError: vi.fn(),
    });

    expect(onAlert).toHaveBeenCalledWith(
      "Please select a payment plan for all travelers to continue",
    );
    expect(setConfirmingBooking).toHaveBeenCalledWith(true);
    expect(setConfirmingBooking).toHaveBeenCalledWith(false);
  });

  it("alerts and returns early when Step 2 payment is not confirmed", async () => {
    const onAlert = vi.fn();
    const setConfirmingBooking = vi.fn();
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await runConfirmBookingAction({
      paymentConfirmed: false,
      isLastMinute: false,
      allPlansSelected: true,
      numberOfPeople: 1,
      paymentPlans: [{ plan: "P1", tourCostShare: 1000, reservationFeeShare: 250 }],
      availablePaymentPlans: [{ id: "P1", type: "installment", label: "P1" }],
      bookingId: "",
      paymentDocId: "doc-1",
      email: "a@x.com",
      tourPackage: "tour-1",
      setConfirmingBooking,
      setFetchedPaymentPlanLabel: vi.fn(),
      setBookingConfirmed: vi.fn(),
      onAlert,
      onError: vi.fn(),
    });

    expect(onAlert).toHaveBeenCalledWith(
      "Please complete Step 2 payment before selecting a payment plan.",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(setConfirmingBooking).toHaveBeenCalledWith(true);
    expect(setConfirmingBooking).toHaveBeenCalledWith(false);

    fetchSpy.mockRestore();
  });

  it("confirms booking and marks bookingConfirmed true on success", async () => {
    const onAlert = vi.fn();
    const setBookingConfirmed = vi.fn();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ bookingDocumentId: "booking-doc-1" }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true }),
      } as any);

    await runConfirmBookingAction({
      paymentConfirmed: true,
      isLastMinute: false,
      allPlansSelected: true,
      numberOfPeople: 1,
      paymentPlans: [
        {
          plan: "p1_single_installment",
          tourCostShare: 1000,
          reservationFeeShare: 250,
        },
      ],
      availablePaymentPlans: [
        {
          id: "p1_single_installment",
          type: "p1_single_installment",
          label: "P1",
        },
      ],
      bookingId: "",
      paymentDocId: "doc-1",
      email: "a@x.com",
      tourPackage: "tour-1",
      setConfirmingBooking: vi.fn(),
      setFetchedPaymentPlanLabel: vi.fn(),
      setBookingConfirmed,
      onAlert,
      onError: vi.fn(),
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/stripe-payments/select-plan",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/send-booking-status-confirmation",
      expect.objectContaining({ method: "POST" }),
    );
    expect(setBookingConfirmed).toHaveBeenCalledWith(true);
    expect(onAlert).not.toHaveBeenCalledWith(
      "An error occurred while confirming your booking. Please try again.",
    );

    fetchSpy.mockRestore();
  });
  const confirmParty = async (isLastMinute: boolean) => {
    getReservationMock.mockResolvedValueOnce({
      id: "doc-1",
      bookingDocumentIds: ["main", "guest"],
    });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({ ok: true, json: async () => ({ ok: true }) } as any);
    fetchSpy.mockClear();

    await runConfirmBookingAction({
      paymentConfirmed: true,
      isLastMinute,
      allPlansSelected: true,
      numberOfPeople: 2,
      paymentPlans: [
        { plan: "p2", tourCostShare: 1000, reservationFeeShare: 250 },
        { plan: "", tourCostShare: 1000, reservationFeeShare: 250 },
      ],
      availablePaymentPlans: [{ id: "p2", type: "p2", label: "P2" }],
      bookingId: "",
      paymentDocId: "doc-1",
      email: "a@x.com",
      tourPackage: "tour-1",
      setConfirmingBooking: vi.fn(),
      setFetchedPaymentPlanLabel: vi.fn(),
      setBookingConfirmed: vi.fn(),
      onAlert: vi.fn(),
      onError: vi.fn(),
    });

    return fetchSpy.mock.calls
      .filter(([url]) => url === "/api/stripe-payments/select-plan")
      .map(([, init]) => JSON.parse(String((init as RequestInit).body)));
  };

  it("sets a plan for the main booker only, leaving guests to choose theirs", async () => {
    const plans = await confirmParty(false);
    expect(plans.map((p) => [p.bookingDocumentId, p.paymentPlanId])).toEqual([["main", "p2"]]);
  });

  it("puts everyone on full payment for a last-minute booking", async () => {
    const plans = await confirmParty(true);
    expect(plans.map((p) => [p.bookingDocumentId, p.paymentPlanId])).toEqual([
      ["main", "full_payment"],
      ["guest", "full_payment"],
    ]);
  });
});
