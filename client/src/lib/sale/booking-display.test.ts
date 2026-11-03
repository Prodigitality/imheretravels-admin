import { describe, expect, it } from "vitest";
import { saleColumnValue, saleDiscountedCost } from "./booking-display";

const booking = { saleName: "Black Friday Sale 2026", saleDiscountGBP: 500, originalTourCost: 1199, discountedTourCost: 699 };

describe("saleColumnValue", () => {
  it("shows the sale as the event, with its flat discount", () => {
    expect(saleColumnValue(booking, "eventName")).toBe("Black Friday Sale 2026");
    expect(saleColumnValue(booking, "discountType")).toBe("Flat amount");
    expect(saleColumnValue(booking, "discountRate")).toBe("£500 off");
  });

  it("works the discount out from the costs when it wasn't stored", () => {
    expect(saleColumnValue({ ...booking, saleDiscountGBP: 0 }, "discountRate")).toBe("£500 off");
    expect(saleColumnValue({ ...booking, saleDiscountGBP: undefined, originalTourCost: "1199", discountedTourCost: "899" }, "discountRate")).toBe("£300 off");
  });

  it("shows no discount when there is nothing to show", () => {
    expect(saleColumnValue({ saleName: "Black Friday Sale 2026" }, "discountRate")).toBeNull();
  });

  it("leaves other columns and bookings alone", () => {
    expect(saleColumnValue(booking, "tourPackageName")).toBeNull();
    expect(saleColumnValue({ originalTourCost: 1199, discountedTourCost: 699 }, "discountRate")).toBeNull();
    expect(saleColumnValue({ originalTourCost: 1199, discountedTourCost: 699 }, "eventName")).toBeNull();
  });
});

describe("saleDiscountedCost", () => {
  it("takes the slot discount off the tour price", () => {
    expect(saleDiscountedCost(1299, 300)).toBe(999);
    expect(saleDiscountedCost("1299", "500")).toBe(799);
  });

  it("refuses a missing, zero or larger-than-price discount", () => {
    expect(saleDiscountedCost(1299, 0)).toBeNull();
    expect(saleDiscountedCost(1299, undefined)).toBeNull();
    expect(saleDiscountedCost("", 300)).toBeNull();
    expect(saleDiscountedCost(200, 300)).toBeNull();
  });
});
