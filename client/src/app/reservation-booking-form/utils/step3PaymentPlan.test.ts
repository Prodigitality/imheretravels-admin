import { describe, expect, it } from "vitest";
import {
  areAllPaymentPlansSelected,
  buildFullPaymentPlans,
  findSelectedPlanDetails,
  getPaymentPlanId,
  getPaymentPlansToSend,
  getSelectedPaymentPlansCount,
  getTravelerPaymentPlan,
  partyTourCost,
  regularPartyTourCost,
  resolveBookingDocumentIds,
  upsertPaymentPlanAtIndex,
} from "./step3PaymentPlan";

describe("step3PaymentPlan utilities", () => {
  it("checks all plans selected with exact traveler count", () => {
    expect(
      areAllPaymentPlansSelected(
        [
          { plan: "P2", tourCostShare: 1000, reservationFeeShare: 100 },
          { plan: "P3", tourCostShare: 1000, reservationFeeShare: 100 },
        ],
        2,
      ),
    ).toBe(true);

    expect(
      areAllPaymentPlansSelected(
        [{ plan: "P2", tourCostShare: 1000, reservationFeeShare: 100 }],
        2,
      ),
    ).toBe(false);

    expect(
      areAllPaymentPlansSelected(
        [
          { plan: "", tourCostShare: 1000, reservationFeeShare: 100 },
          { plan: "P3", tourCostShare: 1000, reservationFeeShare: 100 },
        ],
        2,
      ),
    ).toBe(false);
  });

  it("counts selected plans", () => {
    expect(
      getSelectedPaymentPlansCount([
        { plan: "P2", tourCostShare: 1000, reservationFeeShare: 100 },
        { plan: "", tourCostShare: 1000, reservationFeeShare: 100 },
        { plan: "P1", tourCostShare: 1000, reservationFeeShare: 100 },
      ]),
    ).toBe(2);
  });

  it("builds full payment plans for each traveler", () => {
    expect(buildFullPaymentPlans(3)).toEqual([
      { plan: "full_payment" },
      { plan: "full_payment" },
      { plan: "full_payment" },
    ]);
  });

  it("upserts plan by active tab and fills missing slots", () => {
    expect(
      upsertPaymentPlanAtIndex([], 2, {
        plan: "P3",
        tourCostShare: 1200,
        reservationFeeShare: 100,
      }),
    ).toEqual([
      { plan: "", tourCostShare: 1200, reservationFeeShare: 100 },
      { plan: "", tourCostShare: 1200, reservationFeeShare: 100 },
      { plan: "P3", tourCostShare: 1200, reservationFeeShare: 100 },
    ]);
  });

  it("shapes plans to send based on last-minute flag", () => {
    const selectedPlans = [
      { plan: "P2", tourCostShare: 1000, reservationFeeShare: 100 },
    ];

    expect(
      getPaymentPlansToSend({
        isLastMinute: false,
        numberOfPeople: 1,
        paymentPlans: selectedPlans,
      }),
    ).toEqual(selectedPlans);

    expect(
      getPaymentPlansToSend({
        isLastMinute: true,
        numberOfPeople: 2,
        paymentPlans: selectedPlans,
      }),
    ).toEqual([{ plan: "full_payment" }, { plan: "full_payment" }]);
  });

  it("returns traveler plan with fallback to first selection", () => {
    const plans = [
      { plan: "P3", tourCostShare: 1200, reservationFeeShare: 100 },
    ];

    expect(getTravelerPaymentPlan(plans, 0)).toEqual(plans[0]);
    expect(getTravelerPaymentPlan(plans, 2)).toEqual(plans[0]);
    expect(getPaymentPlanId(getTravelerPaymentPlan(plans, 2))).toBe("P3");
    expect(getPaymentPlanId(undefined)).toBe("full_payment");
  });

  it("finds selected plan details by id or type", () => {
    const availablePlans = [
      { id: "P2", type: "installment", label: "2 Installments" },
      { id: "full_payment", type: "full_payment", label: "Full Payment" },
    ];

    expect(findSelectedPlanDetails("P2", availablePlans)?.label).toBe(
      "2 Installments",
    );
    expect(findSelectedPlanDetails("full_payment", availablePlans)?.label).toBe(
      "Full Payment",
    );
    expect(findSelectedPlanDetails(undefined, availablePlans)).toBeNull();
  });

  it("resolves booking document ids with array-first fallback", () => {
    expect(
      resolveBookingDocumentIds({
        bookingDocumentIds: ["doc-1", "doc-2"],
        booking: { documentId: "doc-fallback" },
      }),
    ).toEqual(["doc-1", "doc-2"]);

    expect(
      resolveBookingDocumentIds({
        booking: { documentId: "doc-fallback" },
      }),
    ).toEqual(["doc-fallback"]);

    expect(resolveBookingDocumentIds({})).toEqual([]);
  });
});

describe("partyTourCost", () => {
  it("sums the sale prices paid for a Black Friday party", () => {
    expect(
      partyTourCost({ saleTravellerPrices: [1999, 2199], datePrice: 2499, tourPrice: 2000, numberOfPeople: 2 }),
    ).toBe(4198);
  });

  it("uses the date's price for each traveller when there is no sale", () => {
    expect(partyTourCost({ saleTravellerPrices: null, datePrice: 2499, tourPrice: 2000, numberOfPeople: 2 })).toBe(4998);
  });

  it("falls back to the tour price, then to 0", () => {
    expect(partyTourCost({ tourPrice: 1299, numberOfPeople: 1 })).toBe(1299);
    expect(partyTourCost({ numberOfPeople: 3 })).toBe(0);
  });

  it("ignores an empty sale price list", () => {
    expect(partyTourCost({ saleTravellerPrices: [], tourPrice: 1299, numberOfPeople: 2 })).toBe(2598);
  });
});

describe("regularPartyTourCost", () => {
  it("prices every traveller at the date's price, else the tour price", () => {
    expect(regularPartyTourCost({ datePrice: 2499, tourPrice: 2000, numberOfPeople: 2 })).toBe(4998);
    expect(regularPartyTourCost({ tourPrice: 2000, numberOfPeople: 1 })).toBe(2000);
  });
});
