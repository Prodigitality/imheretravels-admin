import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { TourPackage } from "@/types/tours";
import { MAX_SLOTS, parseSaleCsv } from "../sale-utils";
import {
  applyCsvGroup,
  draftFromTour,
  draftSnapshot,
  flatDiscounts,
  ladderToTiers,
  saleDateRows,
  tierLocks,
  tierOfSlot,
  tiersToLadder,
  tourView,
  parseRedirectSlugs,
  toSaleInput,
  newSaleDraft,
  withDateIncluded,
  withDiscountType,
  draftModel,
  heroOfferLabel,
  previewSlots,
  type DraftTour,
} from "./sale-draft";

const fixture = (name: string) => readFileSync(path.join(__dirname, "__fixtures__", name), "utf8");
const tour = (id: string, price = 2199) => ({ id, name: id, slug: id, status: "active", pricing: { original: price }, media: { coverImage: "" } }) as unknown as TourPackage;

describe("ladderToTiers / tiersToLadder", () => {
  it("groups consecutive equal discounts into tiers", () => {
    expect(ladderToTiers([500, 300, 300, 200, 200, 200, 100, 100, 100, 100])).toEqual([
      { discount: 500, count: 1 },
      { discount: 300, count: 2 },
      { discount: 200, count: 3 },
      { discount: 100, count: 4 },
    ]);
  });

  it("keeps non-adjacent equal discounts as separate tiers", () => {
    expect(ladderToTiers([300, 200, 300])).toEqual([
      { discount: 300, count: 1 },
      { discount: 200, count: 1 },
      { discount: 300, count: 1 },
    ]);
  });

  it("round-trips", () => {
    const ladder = [500, 300, 300, 200, 200, 200, 100, 100, 100, 100];
    expect(tiersToLadder(ladderToTiers(ladder))).toEqual(ladder);
    expect(ladderToTiers([])).toEqual([]);
  });

  it("numbers tiers per saved slot", () => {
    const slots = [500, 300, 300, 100].map((discountGBP, i) => ({ index: i + 1, discountGBP }));
    expect([...tierOfSlot(slots).values()]).toEqual([1, 2, 2, 3]);
  });
});

describe("CSV import (one row per tier)", () => {
  it("reads the user's Black Friday file: Argentina = 1×500, 2×300, 3×200, 4×100 = 10 slots", () => {
    for (const file of ["black-friday-2026.csv", "black-friday-2026-admin-import.csv"]) {
      const { groups, errors } = parseSaleCsv(fixture(file));
      expect(errors).toEqual([]);
      const ar = groups.find((g) => g.label === "Argentina")!;
      expect(ar.tiers).toEqual([
        { discount: 500, count: 1 },
        { discount: 300, count: 2 },
        { discount: 200, count: 3 },
        { discount: 100, count: 4 },
      ]);
      expect(tiersToLadder(ar.tiers)).toHaveLength(10);
      expect(ar.warnings).toEqual([]);
    }
  });

  it("accepts Qty as the Slots column, case-insensitively, and strips £/OFF", () => {
    const { groups } = parseSaleCsv("tour,QTY,discount gbp\nPeru,2,£250 OFF\nPeru,3,100\n");
    expect(groups[0].tiers).toEqual([
      { discount: 250, count: 2 },
      { discount: 100, count: 3 },
    ]);
  });

  it(`keeps only the first ${MAX_SLOTS} slots of a tour`, () => {
    const { groups } = parseSaleCsv("Tour,Slots,Discount GBP\nX,15,300\nX,10,100\n");
    expect(groups[0].tiers).toEqual([
      { discount: 300, count: 15 },
      { discount: 100, count: MAX_SLOTS - 15 },
    ]);
    expect(groups[0].warnings[0]).toMatch(/first 20 slots/);
  });

  it("reports a missing Slots column", () => {
    expect(parseSaleCsv("Tour,Discount GBP\nX,100\n").errors[0]).toMatch(/Slots/);
  });

  it("keeps held/sold slots when re-importing over a tour", () => {
    const start: DraftTour[] = applyCsvGroup([], { label: "A", tiers: [{ discount: 500, count: 1 }, { discount: 300, count: 2 }], warnings: [] }, tour("A"), () => false);
    // Slot 2 (position 1) is sold at −£300; the new CSV says everything is −£100.
    const next = applyCsvGroup(start, { label: "A", tiers: [{ discount: 100, count: 4 }], warnings: [] }, tour("A"), (_id, pos) => pos === 1);
    expect(flatDiscounts(next[0])).toEqual(["100", "300", "100", "100"]);
  });
});

describe("tier locking", () => {
  it("blocks edits that would move or reprice a held/sold slot", () => {
    const t = draftFromTour(tour("A"), { label: "A", tiers: [{ discount: 500, count: 1 }, { discount: 300, count: 2 }, { discount: 100, count: 3 }], warnings: [] });
    // Slot 3 (position 2, the 2nd slot of tier 2) is sold.
    const locks = tierLocks(t, (pos) => pos === 2);
    expect(locks[0]).toEqual({ locked: false, minCount: 1, laterLocked: true });
    expect(locks[1]).toEqual({ locked: true, minCount: 2, laterLocked: false });
    expect(locks[2]).toEqual({ locked: false, minCount: 1, laterLocked: false });
  });
});

describe("parseRedirectSlugs", () => {
  it("accepts slugs, slashes and pasted links, one per line or comma separated", () => {
    expect(parseRedirectSlugs("bf\n/deals/, https://www.imheretravels.com/BF2026 imheretravels.com/sale")).toEqual(["bf", "deals", "bf2026", "sale"]);
  });

  it("drops blanks and duplicates", () => {
    expect(parseRedirectSlugs(" \n bf \n bf\n")).toEqual(["bf"]);
  });
});

describe("toSaleInput", () => {
  const input = (patch: Partial<ReturnType<typeof newSaleDraft>>) =>
    toSaleInput({ ...newSaleDraft(false), name: "Sale", slug: "black-friday-2026", status: "paused", ...patch }, {
      unmatched: 0,
      otherSlugs: [],
      tourById: new Map(),
      toursLoaded: true,
    });

  it("lets a live sale use any URL slug that isn't a website page", () => {
    expect(input({}).errors).toEqual([]);
    expect(input({ redirectSlugs: "black-friday\nblackfriday", fallbackUrl: "/" }).input).toMatchObject({
      slug: "black-friday-2026",
      redirectSlugs: ["black-friday", "blackfriday"],
      fallbackUrl: "/",
    });
  });

  it("refuses slugs and extra links that are already website pages", () => {
    expect(input({ slug: "tours" }).errors.map((e) => e.message)).toEqual(["/tours is already a page on the website. Choose another URL slug."]);
    expect(input({ redirectSlugs: "faqs" }).errors.map((e) => e.message)).toEqual(["/faqs is already a page on the website, so it can't be an extra link"]);
  });

  it("expands tiers to the flat ladder the API stores", () => {
    const d = newSaleDraft(true);
    d.tours = [draftFromTour(tour("A"), { label: "A", tiers: [{ discount: 500, count: 1 }, { discount: 300, count: 2 }], warnings: [] })];
    const { input, errors } = toSaleInput(d, { unmatched: 0, otherSlugs: [], tourById: new Map([["A", tour("A")]]), toursLoaded: true });
    expect(errors).toEqual([]);
    expect(input?.tours).toEqual([{ tourPackageId: "A", order: 0, ladder: [500, 300, 300], excludedDates: [] }]);
  });

  describe("tour dates in the sale", () => {
    const at = (iso: string) => ({ toMillis: () => Date.parse(iso) });
    const NOW = Date.parse("2026-11-02T00:00:00Z");
    const dated = {
      ...tour("A", 1199),
      travelDates: [
        { startDate: at("2027-02-20T00:00:00Z"), isAvailable: true },
        { startDate: at("2027-01-16T00:00:00Z"), isAvailable: true, customOriginal: 999 },
        { startDate: at("2026-10-01T00:00:00Z"), isAvailable: true },
        { startDate: at("2027-03-20T00:00:00Z"), isAvailable: false },
      ],
    } as unknown as TourPackage;
    const draft = (excludedDates: string[]) => {
      const d = newSaleDraft(true);
      d.tours = [{ ...draftFromTour(dated, { label: "A", tiers: [{ discount: 100, count: 1 }], warnings: [] }), excludedDates }];
      return d;
    };
    const save = (excludedDates: string[]) => toSaleInput(draft(excludedDates), { unmatched: 0, otherSlugs: [], tourById: new Map([["A", dated]]), toursLoaded: true });

    it("lists upcoming bookable dates, soonest first, with the form's date label", () => {
      expect(saleDateRows(draft(["2027-01-16"]).tours[0], dated, NOW)).toEqual([
        { key: "2027-01-16", label: "Jan 16, 2027", price: 999, included: false },
        { key: "2027-02-20", label: "Feb 20, 2027", price: 1199, included: true },
      ]);
    });

    it("toggles a date without duplicates", () => {
      const t = draft(["2027-02-20"]).tours[0];
      expect(withDateIncluded(t, "2027-01-16", false)).toEqual(["2027-01-16", "2027-02-20"]);
      expect(withDateIncluded(t, "2027-02-20", false)).toEqual(["2027-02-20"]);
      expect(withDateIncluded(t, "2027-02-20", true)).toEqual([]);
    });

    it("saves the excluded dates and prices the tour from the dates left", () => {
      expect(save(["2027-01-16"]).input?.tours[0].excludedDates).toEqual(["2027-01-16"]);
      expect(tourView(draft([]).tours[0], dated).originalPrice).toBe(999);
      expect(tourView(draft(["2027-01-16"]).tours[0], dated).originalPrice).toBe(1199);
    });

    it("refuses a tour with every date left out", () => {
      const res = save(["2027-01-16", "2027-02-20"]);
      expect(res.input).toBeNull();
      expect(res.errors.map((e) => e.message)).toEqual(["A: keep at least one tour date in the sale"]);
    });

    it("counts a date change as an unsaved change", () => {
      expect(draftSnapshot(draft(["2027-01-16"]))).not.toBe(draftSnapshot(draft([])));
    });
  });

  it("refuses more than MAX_SLOTS slots and warns on £0 tiers", () => {
    const d = newSaleDraft(true);
    d.tours = [draftFromTour(tour("A", 400), { label: "A", tiers: [{ discount: 500, count: 1 }], warnings: [] })];
    d.tours[0].tiers.push({ key: "x", discount: "100", count: MAX_SLOTS });
    const res = toSaleInput(d, { unmatched: 0, otherSlugs: [], tourById: new Map([["A", tour("A", 400)]]), toursLoaded: true });
    expect(res.input).toBeNull();
    expect(res.errors.map((e) => e.message).join()).toMatch(/21 slots/);
    expect(res.warnings.join()).toMatch(/tier 1 would sell at £0/);
  });
});

describe("percent discount model", () => {
  const opts = (price = 1449) => ({ unmatched: 0, otherSlugs: [], tourById: new Map([["A", tour("A", price)]]), toursLoaded: true });
  const tiered = () => {
    const t = draftFromTour(tour("A", 1449));
    t.tiers = [
      { key: "a", discount: "250", count: 1 },
      { key: "b", discount: "200", count: 2 },
      { key: "c", discount: "150", count: 3 },
      { key: "d", discount: "75", count: 4 },
    ];
    return { ...newSaleDraft(false), name: "BFS", slug: "bfs", tours: [t] };
  };

  it("switching to percent keeps each tour's slot count and defaults to 20%", () => {
    const d = withDiscountType(tiered(), "percent");
    expect(d.discountType).toBe("percent");
    expect(d.discountPercent).toBe("20");
    expect(d.tours[0].slotCount).toBe(10);
  });

  it("saves the model and a slot count per tour (no ladder)", () => {
    const { input, errors } = toSaleInput(withDiscountType(tiered(), "percent"), opts());
    expect(errors).toEqual([]);
    expect(input?.discountModel).toEqual({ type: "percent", percent: 20 });
    expect(input?.tours[0]).toMatchObject({ tourPackageId: "A", slots: 10 });
    expect(input?.tours[0].ladder).toBeUndefined();
  });

  it("previews every slot at 20% off the from price, in whole pounds", () => {
    const d = withDiscountType(tiered(), "percent");
    const m = draftModel(d);
    const slots = previewSlots(undefined, d.tours[0], 1449, Date.now(), m);
    expect(slots).toHaveLength(10);
    expect(new Set(slots.map((s) => s.salePrice))).toEqual(new Set([1159]));
    expect(slots[0]).toMatchObject({ discount: 290, discountPct: 20 });
    expect(heroOfferLabel(d)).toBe("20% off");
  });

  it("refuses a percent that isn't a whole 1–99", () => {
    for (const bad of ["", "0", "100", "12.5"]) {
      const { errors } = toSaleInput({ ...withDiscountType(tiered(), "percent"), discountPercent: bad }, opts());
      expect(errors.map((e) => e.area)).toContain("settings");
    }
  });

  it("switching back to tiered keeps the tiers when the slot count didn't change", () => {
    const back = withDiscountType(withDiscountType(tiered(), "percent"), "tiered");
    expect(back.tours[0].tiers.map((x) => [x.discount, x.count])).toEqual([["250", 1], ["200", 2], ["150", 3], ["75", 4]]);
    const changed = withDiscountType({ ...withDiscountType(tiered(), "percent"), tours: [{ ...withDiscountType(tiered(), "percent").tours[0], slotCount: 6 }] }, "tiered");
    expect(changed.tours[0].tiers.map((x) => [x.discount, x.count])).toEqual([["250", 6]]);
  });

  it("only the active model's shape counts for unsaved changes", () => {
    const d = withDiscountType(tiered(), "percent");
    const edited = { ...d, tours: [{ ...d.tours[0], tiers: [] }] };
    expect(draftSnapshot(edited)).toBe(draftSnapshot(d));
    expect(draftSnapshot({ ...d, tours: [{ ...d.tours[0], slotCount: 9 }] })).not.toBe(draftSnapshot(d));
  });

  it("groups saved percent slots into one tier for the tracker", () => {
    const slots = [1, 2, 3].map((index) => ({ index, discountGBP: 290 + index, discountPct: 20 }));
    expect([...tierOfSlot(slots).values()]).toEqual([1, 1, 1]);
  });
});
