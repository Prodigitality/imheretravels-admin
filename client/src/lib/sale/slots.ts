// Pure slot-ladder rules shared by the claim transaction, the admin tracking
// table and the tests. No Firestore here.

import type { PublicSlotState, SlotStatus } from "@/types/sale-events";

/** The server keeps a hold this much longer than the countdown it shows. */
export const HOLD_GRACE_MS = 2 * 60_000;
/** Pressing Pay extends the hold once by this much, so 3-D Secure isn't cut off. */
export const PAYING_EXTENSION_MS = 5 * 60_000;
/** How long a hold survives its page closing: long enough for a refresh to reclaim it. */
export const LEAVE_GRACE_MS = 30_000;
/** 1 slot = 1 person; a party takes the next free slots. */
export const MAX_PARTY_SIZE = 10;
export const MAX_SLOTS = 20;

export interface SlotLike {
  index: number;
  status: SlotStatus;
  /** epoch ms; only meaningful while held or paying */
  heldUntilMs?: number | null;
}

/** A held or paying slot whose hold ran out counts as free again (lazy expiry). */
export function effectiveStatus(slot: SlotLike, nowMs: number): SlotStatus {
  if ((slot.status === "held" || slot.status === "paying") && (slot.heldUntilMs ?? 0) <= nowMs) {
    return "available";
  }
  return slot.status;
}

export function publicState(slot: SlotLike, nowMs: number): PublicSlotState {
  const s = effectiveStatus(slot, nowMs);
  if (s === "sold") return "sold";
  if (s === "held" || s === "paying") return "on_hold";
  return "available";
}

/**
 * The lowest `partySize` free slots, in ladder order, or null when there are
 * not enough. Slots are sold in order, so a duo takes e.g. slots 2 and 3.
 */
export function pickSlots<T extends SlotLike>(slots: T[], partySize: number, nowMs: number): T[] | null {
  if (!Number.isInteger(partySize) || partySize < 1) return null;
  const free = [...slots]
    .sort((a, b) => a.index - b.index)
    .filter((s) => effectiveStatus(s, nowMs) === "available");
  return free.length >= partySize ? free.slice(0, partySize) : null;
}

/**
 * Which of the slots a customer was shown have gone since. A claim is refused
 * on these, so nobody ends up holding a slot at a price they never saw.
 */
export function lostSlots(slots: SlotLike[], shown: number[], nowMs: number): number[] {
  return shown.filter((index) => {
    const slot = slots.find((s) => s.index === index);
    return !slot || effectiveStatus(slot, nowMs) !== "available";
  });
}

export function salePriceFor(originalPrice: number, discountGBP: number): number {
  return Math.max(0, Math.round((originalPrice - discountGBP) * 100) / 100);
}

/**
 * How a sale discounts its slots, set per sale in the editor's Settings:
 * - tiered: each slot has its own £ discount (price tiers, slot 1 cheapest);
 * - percent: every slot is the same % off the travel date's own price.
 */
export type DiscountModel = { type: "tiered" } | { type: "percent"; percent: number };
export const DEFAULT_DISCOUNT_MODEL: DiscountModel = { type: "tiered" };
/** Whole percent, 1–99. */
export const MAX_DISCOUNT_PERCENT = 99;

export function parseDiscountModel(raw: unknown): DiscountModel {
  const r = raw as { type?: unknown; percent?: unknown } | null | undefined;
  const pct = Number(r?.percent);
  return r?.type === "percent" && Number.isFinite(pct) && pct > 0 && pct <= 100 ? { type: "percent", percent: pct } : DEFAULT_DISCOUNT_MODEL;
}

/** The parts of a slot that set its price. `discountPct` wins when set. */
export interface SlotDiscount {
  discountGBP: number;
  discountPct?: number | null;
}

/**
 * £ off `price` for one slot: its percentage of that price (whole pounds) when
 * it has one, else its fixed £ discount. Price = the travel date's price, or
 * the tour's "from" price before a date is picked.
 */
export function slotDiscountGBP(price: number, slot: SlotDiscount): number {
  const pct = slot.discountPct;
  return typeof pct === "number" && pct > 0 ? Math.round((price * pct) / 100) : slot.discountGBP;
}

/** Sale price of one slot on `price`. */
export function slotSalePrice(price: number, slot: SlotDiscount): number {
  return salePriceFor(price, slotDiscountGBP(price, slot));
}

/** "−20%" or "−£250", for one slot. */
export function slotDiscountLabel(slot: SlotDiscount, formatGBP: (n: number) => string): string {
  return typeof slot.discountPct === "number" && slot.discountPct > 0 ? `${slot.discountPct}%` : formatGBP(slot.discountGBP);
}

export interface SaleWindow {
  status: string;
  startAtMs: number | null;
  endAtMs: number | null;
}

/** Claims are accepted only while the sale is live and inside its window. */
export function isSaleOpen(sale: SaleWindow, nowMs: number): boolean {
  if (sale.status !== "live") return false;
  if (sale.startAtMs !== null && nowMs < sale.startAtMs) return false;
  if (sale.endAtMs !== null && nowMs >= sale.endAtMs) return false;
  return true;
}
