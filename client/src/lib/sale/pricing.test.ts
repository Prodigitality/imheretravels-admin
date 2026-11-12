import { describe, expect, it } from "vitest";
import { datePrice, slotPrice, tourPriceInfo, travelDateKey } from "./pricing";

const NOW = Date.parse("2026-11-01T00:00:00Z");
const at = (iso: string) => ({ toMillis: () => Date.parse(iso) });

describe("dates left out of the sale", () => {
  const dates = [
    { startDate: at("2027-01-16T00:00:00Z"), customOriginal: 999 },
    { startDate: at("2027-02-20T00:00:00Z"), customOriginal: 1199 },
    { startDate: at("2027-03-20T00:00:00Z"), customOriginal: 1299 },
  ];

  it("don't set the from price or count as a price difference", () => {
    const all = tourPriceInfo(1199, dates, NOW);
    expect(all.fromPrice).toBe(999);
    const info = tourPriceInfo(1199, dates, NOW, ["2027-01-16", "2027-03-20"]);
    expect(info.fromPrice).toBe(1199);
    expect(info.pricesVary).toBe(false);
    expect([...info.byDate.keys()]).toEqual(["2027-02-20"]);
  });
});

describe("date-based sale pricing", () => {
  it("uses a date's own price when it has one, else the tour price", () => {
    expect(datePrice(1699, { customOriginal: 1899 })).toBe(1899);
    expect(datePrice(1699, { customOriginal: null })).toBe(1699);
    expect(datePrice(1699, undefined)).toBe(1699);
  });

  it("from price is the cheapest upcoming bookable date", () => {
    const info = tourPriceInfo(
      1699,
      [
        { startDate: at("2027-01-31T01:00:00Z"), customOriginal: 1899 },
        { startDate: at("2027-03-10T01:00:00Z") },
        { startDate: at("2026-10-01T01:00:00Z"), customOriginal: 999 }, // past
        { startDate: at("2027-05-01T01:00:00Z"), customOriginal: 1299, isAvailable: false }, // hidden
      ],
      NOW,
    );
    expect(info.fromPrice).toBe(1699);
    expect(info.pricesVary).toBe(true);
    expect(info.byDate.get("2027-01-31")).toBe(1899);
    expect(info.byDate.size).toBe(2);
  });

  it("falls back to the tour price when there are no upcoming dates", () => {
    expect(tourPriceInfo(2199, [], NOW)).toMatchObject({ fromPrice: 2199, pricesVary: false });
  });

  it("slot price = date price − discount, never below 0", () => {
    expect(slotPrice(1899, { discountGBP: 400 })).toEqual({ discountGBP: 400, salePrice: 1499 });
    expect(slotPrice(300, { discountGBP: 500 }).salePrice).toBe(0);
    expect(travelDateKey(at("2027-01-31T01:00:00Z"))).toBe("2027-01-31");
  });
});

describe("percent slots", () => {
  it("take the % off each date's own price, in whole pounds", () => {
    const slot = { discountGBP: 290, discountPct: 20 };
    expect(slotPrice(1449, slot)).toEqual({ discountGBP: 290, salePrice: 1159 });
    // A pricier date gets a bigger £ discount; the stored £ is ignored.
    expect(slotPrice(1999, slot)).toEqual({ discountGBP: 400, salePrice: 1599 });
  });

  it("fall back to the fixed £ when no % is set", () => {
    expect(slotPrice(1999, { discountGBP: 250, discountPct: null })).toEqual({ discountGBP: 250, salePrice: 1749 });
  });
});
