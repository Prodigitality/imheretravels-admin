"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saleDiscountedCost } from "@/lib/sale/booking-display";

const gbp = (n: number) =>
  `£${n.toLocaleString("en-GB", { maximumFractionDigits: 2 })}`;

/**
 * Discounts section of the Edit Booking modal for a sale booking. Stands in
 * for the Event Name / Discount / Discount Type columns, which recompute from
 * discountEvents and so can't hold a sale. Matches what Booking Details shows.
 *
 * The discount stays local until "Apply to price", which hands it to `onApply`
 * to store on the booking and take off the tour price.
 */
export function SaleDiscountEditor({
  saleName,
  discountGBP,
  originalTourCost,
  discountedTourCost,
  onApply,
  disabled,
}: {
  saleName: string;
  discountGBP: unknown;
  originalTourCost: unknown;
  discountedTourCost: unknown;
  onApply: (discountGBP: number, discountedTourCost: number) => void;
  disabled?: boolean;
}) {
  const stored = Number(discountGBP) || 0;
  const [draft, setDraft] = useState(stored ? String(stored) : "");
  const [dirty, setDirty] = useState(false);

  // Follow external changes (e.g. another admin edited) until the user edits.
  useEffect(() => {
    if (!dirty) setDraft(stored ? String(stored) : "");
  }, [stored, dirty]);

  const discount = Number(draft);
  const original = Number(originalTourCost);
  const target = saleDiscountedCost(original, discount);
  const current = Number(discountedTourCost) || original;
  const inSync = target !== null && current === target && discount === stored;

  const row =
    "flex items-center justify-between border border-field-border transition-colors hover:bg-muted/10";
  const labelCell =
    "w-[40%] px-2.5 sm:px-3 py-1.5 sm:py-2 border-r border-field-border text-[11px] sm:text-xs font-medium";
  const valueCell = "w-[60%] px-2.5 sm:px-3 py-1.5 sm:py-2 text-[11px] sm:text-xs";

  return (
    <div className="border border-field-border">
      <div className={row}>
        <div className={labelCell}>Event Name</div>
        <div className={valueCell}>{saleName}</div>
      </div>

      <div className={row}>
        <label htmlFor="field-saleDiscountGBP" className={labelCell}>
          Discount
        </label>
        <div className={`${valueCell} flex items-center gap-1.5`}>
          <span className="text-muted-foreground">£</span>
          <Input
            id="field-saleDiscountGBP"
            type="number"
            min={0}
            step="1"
            inputMode="decimal"
            value={draft}
            disabled={disabled}
            onChange={(e) => {
              setDraft(e.target.value);
              setDirty(true);
            }}
            className="h-8 w-28 text-[11px] sm:text-xs"
          />
          <span className="text-muted-foreground">off</span>
        </div>
      </div>

      <div className={row}>
        <div className={labelCell}>Discount Type</div>
        <div className={valueCell}>Flat amount</div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 sm:px-3 py-2 bg-muted/20 text-[11px] sm:text-xs">
        {target === null ? (
          <span className="text-red-600">
            Enter a discount between £1 and the tour price
            {original > 0 ? ` (${gbp(original)})` : ""}.
          </span>
        ) : inSync ? (
          <span className="text-muted-foreground">
            Discounted Tour Cost is {gbp(target)} ({gbp(original)} −{" "}
            {gbp(discount)}).
          </span>
        ) : (
          <span>
            Discounted Tour Cost: <s className="text-muted-foreground">{gbp(current)}</s>{" "}
            → <strong>{gbp(target)}</strong> ({gbp(original)} − {gbp(discount)})
          </span>
        )}
        <Button
          type="button"
          size="sm"
          disabled={disabled || target === null || inSync}
          onClick={() => {
            if (target === null) return;
            setDirty(false);
            onApply(discount, target);
          }}
          className="h-7 text-[11px]"
        >
          Apply to price
        </Button>
      </div>
    </div>
  );
}
