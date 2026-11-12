// Editor state for a sale, and the pure rules around it: building a draft from
// a saved sale or a tour, price tiers, applying CSV rows, slot locking, and
// turning the draft into the API's SaleInput. No React here.
//
// A sale tour is a link to a tour package plus a discount ladder. 1 slot =
// 1 person: a party of N takes the next N free slots. The server stores a flat
// ladder (one discount per slot); the editor shows it as price tiers — runs of
// consecutive slots with the same discount, e.g. Tier 1: 1 slot at −£500,
// Tier 2: 2 slots at −£300 … — and expands tiers back to the flat ladder on
// save. The tour's name, slug, cover and price always come from the tour
// package, so the editor never edits them.
//
// The sale's discount model (Settings) decides which of those applies:
// "tiered" is the price tiers above; "percent" gives every slot of every tour
// the same % off the travel date's price, so a tour only has a slot count.

import { tourPriceInfo } from "@/lib/sale/pricing";
import { MAX_DISCOUNT_PERCENT, slotDiscountGBP, slotSalePrice, type SlotDiscount } from "@/lib/sale/slots";
import type { SaleInput, SaleWithInventory } from "@/services/sale-events-service";
import type { SaleCheckoutMode, SaleDiscountModel, SaleSlot, SaleStatus } from "@/types/sale-events";
import type { TourPackage } from "@/types/tours";
import {
  MAX_SLOTS,
  WWW_ORIGIN,
  formatGBP,
  isoToLocalInput,
  isSlotLocked,
  localInputToIso,
  numOrNaN,
  slotDisplayStatus,
  type CsvTourGroup,
  type PriceTier,
} from "../sale-utils";

let seq = 0;
export const newKey = () => `k${++seq}`;

// ---------------------------------------------------------------------------
// Tiers ⇄ flat ladder
// ---------------------------------------------------------------------------

/** Groups consecutive slots with the same discount into tiers (slot order = tier order). */
export function ladderToTiers(ladder: number[]): PriceTier[] {
  const tiers: PriceTier[] = [];
  for (const d of ladder) {
    const last = tiers[tiers.length - 1];
    if (last && last.discount === d) last.count++;
    else tiers.push({ discount: d, count: 1 });
  }
  return tiers;
}

/** Expands tiers to one discount per slot, tier 1 first. */
export function tiersToLadder(tiers: PriceTier[]): number[] {
  return tiers.flatMap((t) => Array.from({ length: Math.max(0, Math.floor(t.count)) }, () => t.discount));
}

/** Tier number (1-based) for each slot index (1-based) of a saved ladder. */
export function tierOfSlot(slots: Pick<SaleSlot, "index" | "discountGBP" | "discountPct">[]): Map<number, number> {
  const out = new Map<number, number>();
  let tier = 0;
  let prev: string | undefined;
  for (const s of [...slots].sort((a, b) => a.index - b.index)) {
    // Percent slots group by their %, whatever £ that came to.
    const key = s.discountPct ? `${s.discountPct}%` : `£${s.discountGBP}`;
    if (prev === undefined || key !== prev) tier++;
    prev = key;
    out.set(s.index, tier);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Draft model
// ---------------------------------------------------------------------------

export interface DraftTier {
  key: string;
  /** Discount £ per person, as typed. */
  discount: string;
  /** Slots (= people) at this discount. */
  count: number;
}

export interface DraftTour {
  key: string;
  tourPackageId: string;
  /** Last known tour data (from the saved sale), used if the tour isn't in the loaded list. */
  saved: { name: string; slug: string; coverImage?: string; originalPrice: number };
  /** Tiered sales: price tiers in sale order; tier 1's slots sell first. */
  tiers: DraftTier[];
  /** Percent sales: how many slots (people) the tour has. */
  slotCount: number;
  /** Travel dates left out of the sale, as date keys. */
  excludedDates: string[];
  /** CSV import notes for this tour. */
  notes: string[];
}

export interface SaleDraft {
  name: string;
  slug: string;
  /** False while the slug still follows the name. */
  slugTouched: boolean;
  status: SaleStatus;
  /** "YYYY-MM-DDTHH:mm" in the browser's timezone, or "". */
  startLocal: string;
  endTba: boolean;
  endLocal: string;
  holdMinutes: string;
  checkoutMode: SaleCheckoutMode;
  heroTitle: string;
  heroSubtitle: string;
  bannerUrl: string;
  mobileBannerUrl: string;
  seoTitle: string;
  seoDescription: string;
  ogImage: string;
  /** Extra links, one per line. */
  redirectSlugs: string;
  fallbackUrl: string;
  /** Settings → Discount model. */
  discountType: SaleDiscountModel["type"];
  /** Percent off every slot, as typed (used when discountType is "percent"). */
  discountPercent: string;
  tours: DraftTour[];
}

export interface UnmatchedGroup {
  key: string;
  group: CsvTourGroup;
  candidates: TourPackage[];
  reason?: string;
}

/** Slots a tour starts with in a percent sale. */
export const DEFAULT_PERCENT_SLOTS = 10;
export const DEFAULT_PERCENT = 20;

/** The draft's discount model. `percent` is NaN while the field isn't a whole 1–99. */
export type DraftModel = { type: "tiered" } | { type: "percent"; percent: number };
export const TIERED: DraftModel = { type: "tiered" };

export function parsePercent(raw: string): number {
  const n = numOrNaN(raw);
  return Number.isInteger(n) && n >= 1 && n <= MAX_DISCOUNT_PERCENT ? n : NaN;
}

export const draftModel = (d: Pick<SaleDraft, "discountType" | "discountPercent">): DraftModel =>
  d.discountType === "percent" ? { type: "percent", percent: parsePercent(d.discountPercent) } : TIERED;

/**
 * The tour's discount runs in sale order: its price tiers, or in a percent
 * sale one run of all its slots at the sale's %. `discount` is null when not
 * entered (or invalid) yet.
 */
export function discountRuns(t: DraftTour, m: DraftModel = TIERED): { discount: SlotDiscount | null; count: number }[] {
  if (m.type === "percent") {
    return [{ discount: Number.isFinite(m.percent) ? { discountGBP: 0, discountPct: m.percent } : null, count: t.slotCount }];
  }
  return t.tiers.map((x) => {
    const n = numOrNaN(x.discount);
    return { discount: Number.isFinite(n) && n >= 0 ? { discountGBP: n } : null, count: x.count };
  });
}

/**
 * Switches the draft's discount model. Each tour keeps its number of slots:
 * going to percent, the slot count is the tiers' total; going back to tiered,
 * the tiers are kept if they still add up, else one tier covers the slots.
 */
export function withDiscountType(d: SaleDraft, type: SaleDraft["discountType"]): SaleDraft {
  if (type === d.discountType) return d;
  const tours = d.tours.map((t) => {
    if (type === "percent") return { ...t, slotCount: Math.max(1, totalSlots(t)) };
    if (totalSlots(t) === t.slotCount) return t;
    return { ...t, tiers: [newTier(t.tiers[0]?.discount ?? "", t.slotCount)] };
  });
  return { ...d, discountType: type, discountPercent: d.discountPercent.trim() ? d.discountPercent : String(DEFAULT_PERCENT), tours };
}

export const SEO_TITLE_MAX = 70;
export const SEO_DESCRIPTION_MAX = 200;

const toDraftTiers = (tiers: PriceTier[]): DraftTier[] => tiers.map((t) => ({ key: newKey(), discount: String(t.discount), count: t.count }));
const newTier = (discount = "", count = 1): DraftTier => ({ key: newKey(), discount, count });

export const totalSlots = (t: DraftTour, m: DraftModel = TIERED) =>
  m.type === "percent" ? t.slotCount : t.tiers.reduce((n, x) => n + (Number.isInteger(x.count) && x.count > 0 ? x.count : 0), 0);

/** One discount (as typed) per slot, tier 1 first. */
export const flatDiscounts = (t: DraftTour): string[] => t.tiers.flatMap((x) => Array.from({ length: Math.max(0, x.count) }, () => x.discount));

/** 0-based slot positions [start, end) covered by each tier (one run in a percent sale). */
export function tierRanges(t: DraftTour, m: DraftModel = TIERED): { start: number; end: number }[] {
  let pos = 0;
  return discountRuns(t, m).map((x) => {
    const start = pos;
    pos += Math.max(0, x.count);
    return { start, end: pos };
  });
}

// ---------------------------------------------------------------------------
// Live tour data
// ---------------------------------------------------------------------------

export interface TourView {
  name: string;
  coverImage?: string;
  /** Current price per person (tour `pricing.original`). */
  originalPrice: number;
  status: TourPackage["status"] | "missing";
  /** Public tour page, only for active tours. */
  publicUrl: string | null;
  /** Admin tour editor, where the price is changed. */
  editUrl: string;
}

/** What the card shows for a sale tour: the tour package's data, else the last saved copy. */
export function tourView(t: DraftTour, pkg: TourPackage | undefined): TourView {
  const editUrl = `/tours/${encodeURIComponent(t.tourPackageId)}/edit`;
  if (!pkg) {
    return { name: t.saved.name || "Unknown tour", coverImage: t.saved.coverImage, originalPrice: t.saved.originalPrice, status: "missing", publicUrl: null, editUrl };
  }
  return {
    name: pkg.name || t.saved.name,
    coverImage: pkg.media?.coverImage || t.saved.coverImage,
    // Same "from" price the sale page shows: the cheapest upcoming sale date's
    // price (a date's own price when set, else the tour's).
    originalPrice: tourPriceInfo(Number(pkg.pricing?.original) || 0, pkg.travelDates, undefined, t.excludedDates).fromPrice,
    status: pkg.status,
    publicUrl: pkg.status === "active" && pkg.slug ? `${WWW_ORIGIN}/tours/${pkg.slug}` : null,
    editUrl,
  };
}

export interface SaleDateRow {
  key: string;
  /** e.g. "Jan 16, 2027", as the reservation form shows it. */
  label: string;
  price: number;
  included: boolean;
}

// UTC, because a date key is the UTC day of the travel date.
const dateLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** The tour's upcoming bookable dates, soonest first, and whether each is in the sale. */
export function saleDateRows(t: DraftTour, pkg: TourPackage | undefined, now = Date.now()): SaleDateRow[] {
  if (!pkg) return [];
  const { byDate } = tourPriceInfo(Number(pkg.pricing?.original) || 0, pkg.travelDates, now);
  return [...byDate]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, price]) => ({ key, label: dateLabel.format(Date.parse(key)), price, included: !t.excludedDates.includes(key) }));
}

export const withDateIncluded = (t: DraftTour, key: string, included: boolean): string[] =>
  included ? t.excludedDates.filter((k) => k !== key) : [...new Set([...t.excludedDates, key])].sort();

// ---------------------------------------------------------------------------
// Building drafts
// ---------------------------------------------------------------------------

export function draftFromSale(sale: SaleWithInventory): SaleDraft {
  return {
    name: sale.name,
    slug: sale.slug,
    slugTouched: true,
    status: sale.status,
    startLocal: isoToLocalInput(sale.startAt),
    endTba: sale.endAt === null,
    endLocal: isoToLocalInput(sale.endAt),
    holdMinutes: String(sale.holdMinutes),
    checkoutMode: sale.checkoutMode,
    heroTitle: sale.hero.title ?? "",
    heroSubtitle: sale.hero.subtitle ?? "",
    bannerUrl: sale.hero.bannerUrl ?? "",
    mobileBannerUrl: sale.hero.mobileBannerUrl ?? "",
    seoTitle: sale.seo?.title ?? "",
    seoDescription: sale.seo?.description ?? "",
    ogImage: sale.seo?.ogImage ?? "",
    redirectSlugs: (sale.redirectSlugs ?? []).join("\n"),
    fallbackUrl: sale.fallbackUrl ?? "",
    discountType: sale.discountModel?.type ?? "tiered",
    discountPercent: String(sale.discountModel?.type === "percent" ? sale.discountModel.percent : DEFAULT_PERCENT),
    tours: sale.tours.map((t) => {
      // A percent slot's discountGBP is its £ at the "from" price: a fair start if the sale goes back to tiers.
      const ladder = [...(sale.inventory[t.tourPackageId]?.slots ?? [])].sort((a, b) => a.index - b.index).map((s) => s.discountGBP);
      return {
        key: newKey(),
        tourPackageId: t.tourPackageId,
        saved: { name: t.tourName || t.displayName, slug: t.tourSlug, coverImage: t.coverImage, originalPrice: t.originalPrice },
        tiers: ladder.length ? toDraftTiers(ladderToTiers(ladder)) : [newTier()],
        slotCount: ladder.length || DEFAULT_PERCENT_SLOTS,
        excludedDates: t.excludedDates ?? [],
        notes: [],
      };
    }),
  };
}

export function newSaleDraft(isFirstSale: boolean): SaleDraft {
  return {
    name: isFirstSale ? "Black Friday" : "",
    slug: isFirstSale ? "black-friday" : "",
    slugTouched: false,
    status: "draft",
    startLocal: "",
    endTba: true,
    endLocal: "",
    holdMinutes: "15",
    checkoutMode: "auto",
    heroTitle: isFirstSale ? "Black Friday Sale" : "",
    heroSubtitle: "",
    bannerUrl: "",
    mobileBannerUrl: "",
    seoTitle: "",
    seoDescription: "",
    ogImage: "",
    redirectSlugs: "",
    fallbackUrl: "",
    discountType: "tiered",
    discountPercent: String(DEFAULT_PERCENT),
    tours: [],
  };
}

export function draftFromTour(tour: TourPackage, csv?: CsvTourGroup): DraftTour {
  return {
    key: newKey(),
    tourPackageId: tour.id,
    saved: { name: tour.name ?? "", slug: tour.slug ?? "", coverImage: tour.media?.coverImage || undefined, originalPrice: Number(tour.pricing?.original) || 0 },
    tiers: csv?.tiers.length ? toDraftTiers(csv.tiers) : [newTier()],
    slotCount: csv?.tiers.length ? Math.min(MAX_SLOTS, csv.tiers.reduce((n, x) => n + x.count, 0)) : DEFAULT_PERCENT_SLOTS,
    excludedDates: [],
    notes: [],
  };
}

/** Comparable form of a draft, for the unsaved-changes check (ignores React keys and notes). */
export function draftSnapshot(d: SaleDraft): string {
  const { tours, slugTouched: _touched, ...rest } = d;
  // Only the active model's shape counts: tiers in a tiered sale, the slot count in a percent one.
  return JSON.stringify([
    rest,
    tours.map((t) => [t.tourPackageId, d.discountType === "percent" ? t.slotCount : t.tiers.map((x) => [x.discount, x.count]), t.excludedDates]),
  ]);
}

// ---------------------------------------------------------------------------
// Inventory and locking
// ---------------------------------------------------------------------------

export type Inventory = SaleWithInventory["inventory"] | undefined;

export const invSlot = (inv: Inventory, tourPackageId: string, position: number): SaleSlot | undefined =>
  inv?.[tourPackageId]?.slots.find((s) => s.index === position + 1);

export const isLockedAt = (inv: Inventory, tourPackageId: string, position: number, now: number) =>
  isSlotLocked(invSlot(inv, tourPackageId, position), now);

export const tourHasLocked = (inv: Inventory, tourPackageId: string, now: number) =>
  (inv?.[tourPackageId]?.slots ?? []).some((s) => isSlotLocked(s, now));

export interface TierLock {
  /** The tier holds a held/paying/sold slot: no discount change, removal or move. */
  locked: boolean;
  /** Smallest slot count allowed (covers the tier's last locked slot). */
  minCount: number;
  /** A later tier holds a locked slot: this tier's slot count can't change and it can't be removed. */
  laterLocked: boolean;
}

/**
 * Edit rules per tier. Held and sold slots are tied to their slot index on the
 * server, so any edit that would change the discount at a locked index, or
 * shift a locked slot to another index, is refused.
 */
export function tierLocks(t: DraftTour, locked: (pos: number) => boolean, m: DraftModel = TIERED): TierLock[] {
  const ranges = tierRanges(t, m);
  const lastLockedPos = ranges.map(({ start, end }) => {
    let last = -1;
    for (let p = start; p < end; p++) if (locked(p)) last = p;
    return last;
  });
  return ranges.map(({ start }, i) => ({
    locked: lastLockedPos[i] >= 0,
    minCount: lastLockedPos[i] >= 0 ? lastLockedPos[i] - start + 1 : 1,
    laterLocked: lastLockedPos.slice(i + 1).some((p) => p >= 0),
  }));
}

export type PublicSlotState = "available" | "on_hold" | "sold";

export interface PreviewSlot {
  index: number;
  /** £ off at the tour's "from" price. */
  discount: number | null;
  /** Percent slot: its %. */
  discountPct: number | null;
  salePrice: number | null;
  state: PublicSlotState;
  locked: boolean;
}

/**
 * What the sale page would show for each slot right now. Unsold slots are
 * priced from the tour's current price (as the server does); sold slots keep
 * the price they sold at; held slots keep their discount.
 */
export function previewSlots(inv: Inventory, t: DraftTour, originalPrice: number, now: number, m: DraftModel = TIERED): PreviewSlot[] {
  const perSlot = discountRuns(t, m).flatMap((r) => Array.from({ length: Math.max(0, r.count) }, () => r.discount));
  return perSlot.map((typed, pos) => {
    const saved = invSlot(inv, t.tourPackageId, pos);
    const st = saved ? slotDisplayStatus(saved, now) : "available";
    const locked = isSlotLocked(saved, now);
    // Held/sold slots keep the discount they were taken at, whatever the sale's model is now.
    const d = locked && saved ? saved : typed;
    const salePrice = st === "sold" && saved ? saved.salePrice : d ? slotSalePrice(originalPrice, d) : null;
    return {
      index: pos + 1,
      discount: d ? slotDiscountGBP(originalPrice, d) : null,
      discountPct: d?.discountPct || null,
      salePrice,
      state: st === "sold" ? "sold" : st === "held" || st === "paying" ? "on_hold" : "available",
      locked,
    };
  });
}

export interface PreviewTier {
  /** 1-based tier number. */
  tier: number;
  /** £ off at the tour's "from" price. */
  discount: number | null;
  /** Percent sale: the %. */
  discountPct: number | null;
  count: number;
  /** Price a new booking in this tier pays, per person. */
  salePrice: number | null;
  free: number;
  held: number;
  sold: number;
  /** First and last slot numbers (1-based). */
  first: number;
  last: number;
}

/** Per-tier view of the ladder with live slot counts. */
export function previewTiers(inv: Inventory, t: DraftTour, originalPrice: number, now: number, m: DraftModel = TIERED): PreviewTier[] {
  const slots = previewSlots(inv, t, originalPrice, now, m);
  const runs = discountRuns(t, m);
  return tierRanges(t, m).map(({ start, end }, i) => {
    const mine = slots.slice(start, end);
    const d = runs[i].discount;
    return {
      tier: i + 1,
      discount: d ? slotDiscountGBP(originalPrice, d) : null,
      discountPct: d?.discountPct || null,
      count: end - start,
      salePrice: d ? slotSalePrice(originalPrice, d) : null,
      free: mine.filter((s) => s.state === "available").length,
      held: mine.filter((s) => s.state === "on_hold").length,
      sold: mine.filter((s) => s.state === "sold").length,
      first: start + 1,
      last: end,
    };
  });
}

/** "2 free · 1 held · 1 sold" (parts with 0 left out, except free when nothing else). */
export function tierStatusLine(p: Pick<PreviewTier, "free" | "held" | "sold">): string {
  const parts = [p.free && `${p.free} free`, p.held && `${p.held} held`, p.sold && `${p.sold} sold`].filter(Boolean);
  return parts.length ? parts.join(" · ") : "0 free";
}

/** Biggest single-slot discount across the sale ("Up to £X off"). */
export function maxDiscount(d: SaleDraft): number {
  let max = 0;
  for (const t of d.tours) for (const x of t.tiers) {
    const n = numOrNaN(x.discount);
    if (Number.isFinite(n) && x.count > 0) max = Math.max(max, n);
  }
  return max;
}

/** The hero's offer line, as www shows it: "20% off" or "Up to £500 off". Null with no discount yet. */
export function heroOfferLabel(d: SaleDraft): string | null {
  const m = draftModel(d);
  if (m.type === "percent") return Number.isFinite(m.percent) && d.tours.length ? `${m.percent}% off` : null;
  const max = maxDiscount(d);
  return max > 0 ? `Up to ${formatGBP(max)} off` : null;
}

/** Tier numbers (1-based) whose discount is the whole price or more, so they'd sell at £0. */
export function freeTiers(t: DraftTour, originalPrice: number): number[] {
  return t.tiers
    .map((x, i) => ({ n: numOrNaN(x.discount), i }))
    .filter(({ n }) => Number.isFinite(n) && n >= originalPrice)
    .map(({ i }) => i + 1);
}

/** "1, 2, 5–7" from sorted numbers. */
export function numberList(nums: number[]): string {
  const out: string[] = [];
  for (let i = 0; i < nums.length; i++) {
    let j = i;
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
    out.push(j > i ? `${nums[i]}–${nums[j]}` : String(nums[i]));
    i = j;
  }
  return out.join(", ");
}

// ---------------------------------------------------------------------------
// Tier edits (callers check tierLocks first; these don't)
// ---------------------------------------------------------------------------

export const addTier = (t: DraftTour): DraftTier[] => [...t.tiers, newTier(t.tiers[t.tiers.length - 1]?.discount ?? "", 1)];
export const removeTier = (t: DraftTour, i: number): DraftTier[] => t.tiers.filter((_, j) => j !== i);
export function moveTier(t: DraftTour, i: number, dir: -1 | 1): DraftTier[] {
  const j = i + dir;
  if (j < 0 || j >= t.tiers.length) return t.tiers;
  const next = [...t.tiers];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
export const setTier = (t: DraftTour, i: number, patch: Partial<Omit<DraftTier, "key">>): DraftTier[] =>
  t.tiers.map((x, j) => (j === i ? { ...x, ...patch } : x));

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** Applies a CSV group (tiers) to a tour, adding the tour if needed and keeping held/sold slots' discount. */
export function applyCsvGroup(
  tours: DraftTour[],
  group: CsvTourGroup,
  tour: TourPackage,
  locked: (tourPackageId: string, pos: number) => boolean,
): DraftTour[] {
  const notes = [...group.warnings];
  const existing = tours.find((t) => t.tourPackageId === tour.id);
  if (!existing) return [...tours, { ...draftFromTour(tour, group), notes }];

  const current = flatDiscounts(existing);
  const lockedPos = current.map((_, i) => locked(tour.id, i));
  let tiers: DraftTier[];
  if (!lockedPos.some(Boolean)) {
    tiers = toDraftTiers(group.tiers);
  } else {
    // Merge at slot level so locked slots keep their index and discount, then regroup.
    const csv = tiersToLadder(group.tiers).map(String);
    const len = Math.max(csv.length, lockedPos.lastIndexOf(true) + 1);
    const merged = Array.from({ length: len }, (_, i) => (lockedPos[i] ? current[i] : (csv[i] ?? current[i] ?? "")));
    tiers = [];
    for (const v of merged) {
      const last = tiers[tiers.length - 1];
      if (last && last.discount === v) last.count++;
      else tiers.push(newTier(v, 1));
    }
    notes.push("Held/sold slots kept their current discount");
  }
  const slotCount = Math.min(MAX_SLOTS, tiers.reduce((n, x) => n + x.count, 0));
  return tours.map((t) => (t.key === existing.key ? { ...t, tiers, slotCount, notes } : t));
}

// ---------------------------------------------------------------------------
// Validation → SaleInput
// ---------------------------------------------------------------------------

export type DraftArea = "page" | "schedule" | "settings" | "seo" | "tours";
export interface DraftError {
  area: DraftArea;
  message: string;
}

/** Top-level www pages: these win over a sale at the same URL, so the sale would never show. */
const WWW_RESERVED_SLUGS = new Set([
  "about-us", "all-destinations", "all-tours", "api", "contact-us", "destinations", "faqs", "hosted-tours",
  "join-our-community", "personalized-tours", "philippines-destinations", "pre-departure",
  "pre-departure-information", "privacy-policy", "reservation-confirmed", "resident-hosts", "reviews",
  "sale-preview", "terms-and-conditions", "tours", "travel-information", "travel-requirements",
  "travel-safety", "why-us",
]);

const MAX_REDIRECT_SLUGS = 10;

/** "bf, imheretravels.com/deals/" → ["bf", "deals"]. Pasted full links are fine. */
export function parseRedirectSlugs(raw: string): string[] {
  const slugs = raw
    .split(/[\s,]+/)
    .map((s) => s.toLowerCase().replace(/^(https?:\/\/)?(www\.)?imheretravels\.com/, "").replace(/^\/+|\/+$/g, ""))
    .filter(Boolean);
  return [...new Set(slugs)];
}

export function toSaleInput(
  d: SaleDraft,
  opts: { unmatched: number; otherSlugs: string[]; tourById: Map<string, TourPackage>; toursLoaded: boolean },
): { input: SaleInput | null; errors: DraftError[]; warnings: string[] } {
  const errors: DraftError[] = [];
  const warnings: string[] = [];
  const err = (area: DraftArea, message: string) => errors.push({ area, message });

  if (!d.name.trim()) err("page", "Sale name is required");
  if (!/^[a-z0-9-]+$/.test(d.slug)) err("settings", "URL slug can only use lowercase letters, numbers and hyphens");
  else if (opts.otherSlugs.includes(d.slug)) err("settings", `Another sale already uses /${d.slug}`);
  else if (WWW_RESERVED_SLUGS.has(d.slug)) err("settings", `/${d.slug} is already a page on the website. Choose another URL slug.`);
  const redirectSlugs = parseRedirectSlugs(d.redirectSlugs);
  if (redirectSlugs.some((s) => !/^[a-z0-9-]+$/.test(s))) err("settings", "Extra links can only use lowercase letters, numbers and hyphens");
  if (redirectSlugs.includes(d.slug)) err("settings", `/${d.slug} is already the sale page, so it can't be an extra link`);
  const reservedLink = redirectSlugs.find((s) => WWW_RESERVED_SLUGS.has(s));
  if (reservedLink) err("settings", `/${reservedLink} is already a page on the website, so it can't be an extra link`);
  if (redirectSlugs.length > MAX_REDIRECT_SLUGS) err("settings", `Use at most ${MAX_REDIRECT_SLUGS} extra links`);
  const fallbackUrl = d.fallbackUrl.trim();
  if (fallbackUrl && !/^(\/(?!\/)|https:\/\/)/.test(fallbackUrl)) err("settings", "The redirect link must start with / or https://");
  const hold = Number(d.holdMinutes);
  if (!Number.isInteger(hold) || hold < 1 || hold > 60) err("settings", "Hold minutes must be a whole number from 1 to 60");
  const startAt = localInputToIso(d.startLocal);
  const endAt = d.endTba ? null : localInputToIso(d.endLocal);
  if (!d.endTba && !endAt) err("schedule", "Pick an end date, or turn on “End date TBA”");
  if (startAt && endAt && Date.parse(endAt) <= Date.parse(startAt)) err("schedule", "End date must be after the start date");
  if (d.seoTitle.length > SEO_TITLE_MAX) err("seo", `SEO title is over ${SEO_TITLE_MAX} characters`);
  if (d.seoDescription.length > SEO_DESCRIPTION_MAX) err("seo", `SEO description is over ${SEO_DESCRIPTION_MAX} characters`);
  if (d.status === "live" && d.tours.length === 0) err("tours", "Add at least one tour before setting the sale live");
  if (opts.unmatched) err("tours", `Pick or skip the ${opts.unmatched} unmatched CSV tour(s)`);
  const model = draftModel(d);
  const percentSale = model.type === "percent";
  if (percentSale && !Number.isFinite(model.percent)) err("settings", `Discount must be a whole percent from 1 to ${MAX_DISCOUNT_PERCENT}`);

  const tours = d.tours.map((t, i) => {
    const pkg = opts.tourById.get(t.tourPackageId);
    const view = tourView(t, pkg);
    const label = view.name || `Tour ${i + 1}`;
    if (opts.toursLoaded && !pkg) err("tours", `${label}: this tour no longer exists in Tour Packages. Remove it from the sale.`);
    const dates = saleDateRows(t, pkg);
    if (dates.length > 0 && dates.every((d) => !d.included)) err("tours", `${label}: keep at least one tour date in the sale`);
    const total = totalSlots(t, model);
    if (!Number.isInteger(total) || total < 1 || total > MAX_SLOTS) err("tours", `${label}: has ${total} slots; a tour can have 1 to ${MAX_SLOTS}`);
    if (percentSale) return { tourPackageId: t.tourPackageId, order: i, slots: total, excludedDates: t.excludedDates };

    if (t.tiers.some((x) => !Number.isInteger(x.count) || x.count < 1)) err("tours", `${label}: every tier needs at least 1 slot`);
    const tierDiscounts = t.tiers.map((x) => numOrNaN(x.discount));
    if (tierDiscounts.some((n) => !Number.isFinite(n) || n < 0)) err("tours", `${label}: enter a discount (£0 or more) for every tier`);
    const free = freeTiers(t, view.originalPrice);
    if (free.length) warnings.push(`${label}: tier ${numberList(free)} would sell at £0 (discount ≥ ${formatGBP(view.originalPrice)})`);
    const ladder = tiersToLadder(t.tiers.map((x, j) => ({ discount: tierDiscounts[j], count: x.count })));
    return { tourPackageId: t.tourPackageId, order: i, ladder, excludedDates: t.excludedDates };
  });
  if (errors.length) return { input: null, errors, warnings };
  return {
    errors,
    warnings,
    input: {
      slug: d.slug,
      name: d.name.trim(),
      status: d.status,
      startAt,
      endAt,
      holdMinutes: hold,
      checkoutMode: d.checkoutMode,
      // Empty strings clear a banner.
      hero: {
        title: d.heroTitle.trim(),
        subtitle: d.heroSubtitle.trim(),
        bannerUrl: d.bannerUrl.trim(),
        mobileBannerUrl: d.mobileBannerUrl.trim(),
      },
      seo: { title: d.seoTitle.trim(), description: d.seoDescription.trim(), ogImage: d.ogImage.trim() },
      redirectSlugs,
      fallbackUrl,
      discountModel: model.type === "percent" ? { type: "percent", percent: model.percent } : { type: "tiered" },
      tours,
    },
  };
}
