"use client";

import { AlertTriangle, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ExternalLink, Lock, Minus, Package, Pencil, Plus, Trash2, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TourPackage } from "@/types/tours";
import { MAX_SLOTS, formatGBP, numOrNaN } from "../sale-utils";
import { slotSalePrice } from "@/lib/sale/slots";
import { FieldInput, HelpText, LockTip, PanelSectionHead } from "./fields";
import SaleDrawer from "./SaleDrawer";
import {
  addTier,
  freeTiers,
  isLockedAt,
  moveTier,
  numberList,
  previewTiers,
  removeTier,
  saleDateRows,
  setTier,
  tierLocks,
  tierStatusLine,
  totalSlots,
  tourView,
  withDateIncluded,
  type DraftModel,
  type DraftTour,
  type Inventory,
  type TourView,
} from "./sale-draft";

const ICON_BTN =
  "inline-flex size-8 items-center justify-center rounded-full border-2 border-dark-gray/70 text-midnight transition-colors hover:border-midnight hover:bg-light-grey focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-red disabled:cursor-not-allowed disabled:border-light-grey disabled:text-dark-gray/50 disabled:hover:bg-transparent";
const OUTLINE_PILL =
  "inline-flex h-9 items-center gap-1.5 rounded-full border-2 border-midnight px-4 font-body text-sm font-bold text-midnight transition-colors hover:bg-midnight hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-red disabled:cursor-not-allowed disabled:border-light-grey disabled:text-dark-gray/60 disabled:hover:bg-transparent";
const WARN = "text-[#9A4A00]";
const ERROR = "text-[#B4232E]";

const LATER_LOCKED = "Slots after this tier are held or sold";
const TIER_LOCKED = "This tier has held or sold slots";

/** Side editor for one sale tour: the linked tour (read-only) and its price tiers. */
export default function SaleTourDrawer({
  model,
  tour,
  tourPkg,
  inventory,
  now,
  position,
  total,
  hasLocked,
  onPatch,
  onMove,
  onRemove,
  onClose,
}: {
  /** The sale's discount model (Settings). */
  model: DraftModel;
  tour: DraftTour | null;
  tourPkg?: TourPackage;
  inventory: Inventory;
  now: number;
  position: number;
  total: number;
  hasLocked: boolean;
  onPatch: (patch: Partial<DraftTour>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const view = tour ? tourView(tour, tourPkg) : null;
  return (
    <SaleDrawer
      open={!!tour}
      onOpenChange={(o) => !o && onClose()}
      icon={Package}
      title={view ? `Edit deal · ${view.name}` : "Edit deal"}
      description={
        model.type === "percent"
          ? `1 slot = 1 person. Every slot is ${Number.isFinite(model.percent) ? `${model.percent}%` : "the sale's %"} off the travel date's price.`
          : "1 slot = 1 person. Tier 1 sells first, then tier 2, and so on."
      }
      footer={
        tour && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="font-body text-xs text-dark-gray">
                Position {position + 1} of {total}
              </span>
              <button type="button" className={cn(ICON_BTN, "size-9")} disabled={position === 0} onClick={() => onMove(-1)} aria-label="Move this deal earlier">
                <ArrowLeft className="h-4 w-4" aria-hidden />
              </button>
              <button type="button" className={cn(ICON_BTN, "size-9")} disabled={position >= total - 1} onClick={() => onMove(1)} aria-label="Move this deal later">
                <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <LockTip show={hasLocked} text="Has held/sold slots, so it can't be removed">
              <button
                type="button"
                disabled={hasLocked}
                onClick={onRemove}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-full border-2 border-crimson-red px-4 font-body text-sm font-bold transition-colors hover:bg-crimson-red hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-red disabled:cursor-not-allowed disabled:border-light-grey disabled:text-dark-gray/60 disabled:hover:bg-transparent",
                  ERROR,
                )}
              >
                <Trash2 className="h-4 w-4" aria-hidden /> Remove from sale
              </button>
            </LockTip>
          </div>
        )
      }
    >
      {tour && view && <TourEditorBody model={model} tour={tour} tourPkg={tourPkg} view={view} inventory={inventory} now={now} onPatch={onPatch} />}
    </SaleDrawer>
  );
}

function TourEditorBody({
  model,
  tour: t,
  tourPkg,
  view,
  inventory,
  now,
  onPatch,
}: {
  model: DraftModel;
  tour: DraftTour;
  tourPkg?: TourPackage;
  view: TourView;
  inventory: Inventory;
  now: number;
  onPatch: (patch: Partial<DraftTour>) => void;
}) {
  const original = view.originalPrice;
  const locks = tierLocks(t, (pos) => isLockedAt(inventory, t.tourPackageId, pos, now));
  const tiers = previewTiers(inventory, t, original, now);
  const total = totalSlots(t);
  const over = total > MAX_SLOTS;
  const free = freeTiers(t, original);
  const discounts = t.tiers.map((x) => numOrNaN(x.discount));
  const notDescending = discounts.some((d, i) => i > 0 && Number.isFinite(d) && Number.isFinite(discounts[i - 1]) && d > discounts[i - 1]);
  const tiersPatch = (next: DraftTour["tiers"]) => onPatch({ tiers: next });
  const dates = saleDateRows(t, tourPkg, now);
  const datesIn = dates.filter((d) => d.included).length;
  const pct = model.type === "percent" && Number.isFinite(model.percent) ? model.percent : null;

  return (
    <div className="flex flex-col gap-7">
      <section aria-labelledby={`${t.key}-tour-head`}>
        <PanelSectionHead id={`${t.key}-tour-head`}>Tour</PanelSectionHead>
        <div className="flex gap-4">
          <div className="size-20 shrink-0 overflow-hidden rounded-md bg-light-grey">
            {view.coverImage && <img src={view.coverImage} alt="" className="h-full w-full object-cover" />}
          </div>
          <dl className="grid min-w-0 flex-1 grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 font-body text-sm">
            <dt className="font-bold text-midnight">Name</dt>
            <dd className="min-w-0 truncate text-midnight">{view.name}</dd>
            <dt className="font-bold text-midnight">Price</dt>
            <dd className="flex flex-wrap items-center gap-x-3 gap-y-1 text-midnight">
              <span className="tabular-nums">{formatGBP(original)} per person</span>
              <a
                href={view.editUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-bold text-midnight underline underline-offset-2 hover:text-crimson-red"
              >
                <Pencil className="h-3 w-3" aria-hidden /> Edit price in Tour Packages
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </dd>
            <dt className="font-bold text-midnight">Page</dt>
            <dd>
              {view.publicUrl ? (
                <a href={view.publicUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-midnight underline underline-offset-2 hover:text-crimson-red">
                  View tour <ExternalLink className="h-3 w-3" aria-hidden />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              ) : view.status === "missing" ? (
                <span className={cn("font-bold", ERROR)}>Tour not found — remove it from the sale</span>
              ) : (
                <span className="text-dark-gray">{view.status === "draft" ? "Draft — no public page" : "Archived — no public page"}</span>
              )}
            </dd>
          </dl>
        </div>
        <HelpText className="mt-3">
          Name, cover and price come from the tour package and update automatically.{" "}
          {model.type === "percent"
            ? "Sale price = each travel date's price minus the sale's percentage (Settings → Discount model)."
            : "Sale price = the tour's current price minus the tier's discount."}{" "}
          Sold slots keep the price they sold at.
        </HelpText>
        {t.notes.length > 0 && (
          <div className="mt-4 rounded-md border-2 border-vivid-orange/60 bg-light-yellow/40 p-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-sans text-xs font-bold text-midnight">From the CSV import</span>
              <button
                type="button"
                onClick={() => onPatch({ notes: [] })}
                className="inline-flex items-center gap-1 rounded font-body text-xs font-bold text-midnight underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-red"
              >
                <X className="h-3 w-3" aria-hidden /> Dismiss
              </button>
            </div>
            <ul className="flex flex-col gap-1">
              {t.notes.map((n, i) => (
                <li key={i} className="flex gap-1.5 font-body text-xs text-midnight">
                  <AlertTriangle className={cn("mt-0.5 h-3 w-3 shrink-0", WARN)} aria-hidden />
                  {n}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section aria-labelledby={`${t.key}-dates-head`}>
        <PanelSectionHead id={`${t.key}-dates-head`}>Tour dates</PanelSectionHead>
        {dates.length === 0 ? (
          <HelpText>This tour has no upcoming dates to choose from.</HelpText>
        ) : (
          <>
            <ul className="divide-y divide-light-grey rounded-md border-2 border-light-grey">
              {dates.map((d) => (
                <li key={d.key}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 font-body text-sm text-midnight hover:bg-light-grey/50">
                    <input
                      type="checkbox"
                      checked={d.included}
                      onChange={(e) => onPatch({ excludedDates: withDateIncluded(t, d.key, e.target.checked) })}
                      className="size-4 shrink-0 accent-crimson-red [color-scheme:light]"
                    />
                    <span className={cn("font-medium tabular-nums", !d.included && "text-dark-gray")}>{d.label}</span>
                    <span className="ml-auto flex items-center gap-3 text-xs tabular-nums text-dark-gray">
                      {!d.included && <span className="font-bold text-midnight">Not on sale</span>}
                      {d.included && pct !== null ? (
                        <>
                          <span className="line-through">{formatGBP(d.price)}</span>
                          <span className="font-bold text-midnight">{formatGBP(slotSalePrice(d.price, { discountGBP: 0, discountPct: pct }))}</span>
                        </>
                      ) : (
                        formatGBP(d.price)
                      )}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <p className={cn("mt-2 font-sans text-sm font-bold tabular-nums", datesIn === 0 ? ERROR : "text-midnight")} role="status" aria-live="polite">
              {datesIn} of {dates.length} date{dates.length === 1 ? "" : "s"} in the sale
            </p>
            {datesIn === 0 && (
              <p className={cn("mt-2 flex items-start gap-1.5 font-body text-xs font-bold", ERROR)} role="alert">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                Keep at least one date in the sale, or remove this tour from it.
              </p>
            )}
            <HelpText className="mt-3">
              Unticked dates can&apos;t be booked at a sale price, but customers can still book them at the regular price. Sale prices start from the cheapest ticked date. New dates
              added to the tour join the sale automatically. Bookings already made aren&apos;t affected.
            </HelpText>
          </>
        )}
      </section>

      {model.type === "percent" ? (
        <PercentSlots model={model} tour={t} inventory={inventory} now={now} original={original} onPatch={onPatch} />
      ) : (
      <section aria-labelledby={`${t.key}-tiers-head`}>
        <PanelSectionHead id={`${t.key}-tiers-head`}>Price tiers</PanelSectionHead>
        <p className="mb-3 flex items-start gap-2 rounded-md bg-light-grey/70 px-3 py-2 font-body text-xs text-midnight">
          <Users className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            <span className="font-bold">1 slot = 1 person.</span> Each tier is a discount and how many people get it. Tier 1&apos;s slots sell first, then tier 2&apos;s; a party of
            N takes the next N free slots, so a group can span two tiers.
          </span>
        </p>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[30rem]">
            <caption className="sr-only">Price tiers for {view.name}</caption>
            <thead>
              <tr className="text-left font-sans text-xs font-bold text-midnight">
                <th scope="col" className="w-12 pb-2">Tier</th>
                <th scope="col" className="pb-2">Discount £</th>
                <th scope="col" className="pb-2">Slots</th>
                <th scope="col" className="pb-2">Sale price</th>
                <th scope="col" className="pb-2">Status</th>
                <th scope="col" className="pb-2 text-right">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {t.tiers.map((x, i) => {
                const lock = locks[i];
                const p = tiers[i];
                const disc = discounts[i];
                const isFree = Number.isFinite(disc) && disc >= original;
                const countFixed = lock.laterLocked;
                const canDec = !countFixed && x.count > lock.minCount;
                const canInc = !countFixed && total < MAX_SLOTS;
                const moveUpBlocked = i > 0 && (lock.locked || locks[i - 1].locked);
                const moveDownBlocked = i < t.tiers.length - 1 && (lock.locked || locks[i + 1].locked);
                const removeReason = lock.locked ? TIER_LOCKED : lock.laterLocked ? LATER_LOCKED : t.tiers.length === 1 ? "A tour needs at least one tier" : null;
                return (
                  <tr key={x.key} className="border-t border-light-grey align-middle">
                    <th scope="row" className="py-2 text-left font-sans text-sm font-bold text-midnight">
                      {i + 1}
                      <span className="block font-body text-[11px] font-normal text-dark-gray">
                        {p.count > 0 ? (p.first === p.last ? `slot ${p.first}` : `slots ${p.first}–${p.last}`) : "no slots"}
                      </span>
                    </th>
                    <td className="py-2 pr-2">
                      <LockTip show={lock.locked} text="Held/sold slots keep their price">
                        <div className="relative w-24">
                          <FieldInput
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="1"
                            value={x.discount}
                            disabled={lock.locked}
                            onChange={(e) => tiersPatch(setTier(t, i, { discount: e.target.value }))}
                            aria-label={`Tier ${i + 1} discount in pounds`}
                            aria-invalid={x.discount.trim() !== "" && (!Number.isFinite(disc) || disc < 0)}
                            className={cn("h-9", lock.locked && "pr-8")}
                          />
                          {lock.locked && <Lock className="absolute right-2.5 top-2.5 h-4 w-4 text-dark-gray" aria-hidden />}
                        </div>
                      </LockTip>
                    </td>
                    <td className="py-2 pr-2">
                      <LockTip show={countFixed} text={LATER_LOCKED}>
                        <div className="flex items-center gap-1" role="group" aria-label={`Tier ${i + 1} slots`}>
                          <button
                            type="button"
                            className={ICON_BTN}
                            disabled={!canDec}
                            onClick={() => tiersPatch(setTier(t, i, { count: x.count - 1 }))}
                            aria-label={`One slot fewer in tier ${i + 1}`}
                            title={!countFixed && lock.locked && x.count <= lock.minCount ? "Can't drop below the held/sold slots" : undefined}
                          >
                            <Minus className="h-3.5 w-3.5" aria-hidden />
                          </button>
                          <FieldInput
                            type="number"
                            inputMode="numeric"
                            min={lock.minCount}
                            max={MAX_SLOTS}
                            step={1}
                            value={x.count}
                            disabled={countFixed}
                            onChange={(e) => {
                              const n = Math.floor(Number(e.target.value));
                              if (Number.isFinite(n)) tiersPatch(setTier(t, i, { count: Math.max(lock.minCount, n) }));
                            }}
                            aria-label={`Tier ${i + 1} number of slots`}
                            className="h-9 w-14 px-2 text-center"
                          />
                          <button
                            type="button"
                            className={ICON_BTN}
                            disabled={!canInc}
                            onClick={() => tiersPatch(setTier(t, i, { count: x.count + 1 }))}
                            aria-label={`One more slot in tier ${i + 1}`}
                          >
                            <Plus className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        </div>
                      </LockTip>
                    </td>
                    <td className="py-2 pr-2 font-body text-sm font-bold tabular-nums text-midnight">
                      {p.salePrice === null ? <span className="font-normal text-dark-gray">—</span> : formatGBP(p.salePrice)}
                      <span className="block text-[11px] font-normal text-dark-gray">per person</span>
                      {isFree && <span className={cn("block text-xs font-normal", WARN)}>Free: discount ≥ price</span>}
                    </td>
                    <td className="py-2 pr-2 font-body text-xs text-midnight">{tierStatusLine(p)}</td>
                    <td className="py-2">
                      <div className="flex justify-end gap-1">
                        <LockTip show={moveUpBlocked} text={TIER_LOCKED}>
                          <button
                            type="button"
                            className={ICON_BTN}
                            disabled={i === 0 || moveUpBlocked}
                            onClick={() => tiersPatch(moveTier(t, i, -1))}
                            aria-label={`Move tier ${i + 1} up`}
                          >
                            <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        </LockTip>
                        <LockTip show={moveDownBlocked} text={TIER_LOCKED}>
                          <button
                            type="button"
                            className={ICON_BTN}
                            disabled={i === t.tiers.length - 1 || moveDownBlocked}
                            onClick={() => tiersPatch(moveTier(t, i, 1))}
                            aria-label={`Move tier ${i + 1} down`}
                          >
                            <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        </LockTip>
                        <LockTip show={!!removeReason && t.tiers.length > 1} text={removeReason ?? ""}>
                          <button
                            type="button"
                            className={cn(ICON_BTN, "hover:border-crimson-red hover:text-[#B4232E]")}
                            disabled={!!removeReason}
                            onClick={() => tiersPatch(removeTier(t, i))}
                            aria-label={`Remove tier ${i + 1}`}
                          >
                            <X className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        </LockTip>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={() => tiersPatch(addTier(t))} disabled={total >= MAX_SLOTS} className={OUTLINE_PILL}>
            <Plus className="h-4 w-4" aria-hidden /> Add tier
          </button>
          <p className={cn("font-sans text-sm font-bold tabular-nums", over ? ERROR : "text-midnight")} role="status" aria-live="polite">
            {total} slot{total === 1 ? "" : "s"} = up to {total} {total === 1 ? "person" : "people"}
            <span className="font-body text-xs font-normal text-dark-gray"> · max {MAX_SLOTS}</span>
          </p>
        </div>
        {over && (
          <p className={cn("mt-2 flex items-start gap-1.5 font-body text-xs font-bold", ERROR)} role="alert">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />A tour can have at most {MAX_SLOTS} slots. Remove {total - MAX_SLOTS} to save.
          </p>
        )}
        {free.length > 0 && (
          <p className={cn("mt-2 flex items-start gap-1.5 font-body text-xs", WARN)}>
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Tier {numberList(free)} would sell at £0: the discount is the whole {formatGBP(original)} price or more.
          </p>
        )}
        {notDescending && (
          <p className={cn("mt-2 flex items-start gap-1.5 font-body text-xs", WARN)}>
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />A later tier has a bigger discount than an earlier one. Tier 1 is usually the biggest discount.
          </p>
        )}
        <HelpText className="mt-3">“Add tier” copies the last tier&apos;s discount with 1 slot. Tiers with held or sold slots, and the slots before them, can&apos;t be reshaped.</HelpText>
      </section>
      )}
    </div>
  );
}

/** Percent sale: the tour only has a slot count; every slot gets the sale's %. */
function PercentSlots({
  model,
  tour: t,
  inventory,
  now,
  original,
  onPatch,
}: {
  model: Extract<DraftModel, { type: "percent" }>;
  tour: DraftTour;
  inventory: Inventory;
  now: number;
  original: number;
  onPatch: (patch: Partial<DraftTour>) => void;
}) {
  const [lock] = tierLocks(t, (pos) => isLockedAt(inventory, t.tourPackageId, pos, now), model);
  const [p] = previewTiers(inventory, t, original, now, model);
  const minCount = lock?.minCount ?? 1;
  const setCount = (n: number) => onPatch({ slotCount: Math.min(MAX_SLOTS, Math.max(minCount, n)) });
  const valid = Number.isFinite(model.percent);
  return (
    <section aria-labelledby={`${t.key}-slots-head`}>
      <PanelSectionHead id={`${t.key}-slots-head`}>Slots</PanelSectionHead>
      <p className="mb-3 flex items-start gap-2 rounded-md bg-light-grey/70 px-3 py-2 font-body text-xs text-midnight">
        <Users className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          <span className="font-bold">1 slot = 1 person.</span> Every slot is {valid ? `${model.percent}%` : "the sale's %"} off the price of the travel date the customer picks.
          Change the % in Settings → Discount model; it applies to every tour.
        </span>
      </p>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <LockTip show={!!lock?.locked && t.slotCount <= minCount} text="Can't drop below the held/sold slots">
          <div className="flex items-center gap-1" role="group" aria-label="Number of slots">
            <button type="button" className={ICON_BTN} disabled={t.slotCount <= minCount} onClick={() => setCount(t.slotCount - 1)} aria-label="One slot fewer">
              <Minus className="h-3.5 w-3.5" aria-hidden />
            </button>
            <FieldInput
              type="number"
              inputMode="numeric"
              min={minCount}
              max={MAX_SLOTS}
              step={1}
              value={t.slotCount}
              onChange={(e) => {
                const n = Math.floor(Number(e.target.value));
                if (Number.isFinite(n)) setCount(n);
              }}
              aria-label="Number of slots"
              className="h-9 w-16 px-2 text-center"
            />
            <button type="button" className={ICON_BTN} disabled={t.slotCount >= MAX_SLOTS} onClick={() => setCount(t.slotCount + 1)} aria-label="One more slot">
              <Plus className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        </LockTip>
        <div className="font-body text-sm tabular-nums text-midnight">
          {p?.salePrice != null ? (
            <>
              <span className="font-bold">{formatGBP(p.salePrice)}</span> per person
              <span className="text-dark-gray">
                {" "}
                from {formatGBP(original)} (−{formatGBP(p.discount ?? 0)})
              </span>
            </>
          ) : (
            <span className={ERROR}>Set the discount % in Settings</span>
          )}
          {p && <span className="block text-xs text-dark-gray">{tierStatusLine(p)}</span>}
        </div>
      </div>
      <p className="mt-3 font-sans text-sm font-bold tabular-nums text-midnight" role="status" aria-live="polite">
        {t.slotCount} slot{t.slotCount === 1 ? "" : "s"} = up to {t.slotCount} {t.slotCount === 1 ? "person" : "people"}
        <span className="font-body text-xs font-normal text-dark-gray"> · max {MAX_SLOTS}</span>
      </p>
      <HelpText className="mt-3">Held and sold slots keep the price they were taken at, so the count can&apos;t go below the last of them.</HelpText>
    </section>
  );
}
