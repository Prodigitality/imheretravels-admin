import { useEffect, useState } from "react";
import type { SaleOffer } from "@/lib/sale/sales";

/**
 * The open sale this tour can be booked in right now, if any: tags its dates in
 * the date list and stops them being booked here at the regular price. Checked
 * again whenever the date changes, so a sale that sells out stops counting.
 */
export function useSaleOffer(tourPackageId: string, tourDate: string, enabled: boolean) {
  const [state, setState] = useState<{ tour: string; offer: SaleOffer | null } | null>(null);

  useEffect(() => {
    if (!enabled || !tourPackageId) return;
    const ctrl = new AbortController();
    fetch(`/api/public/sale/offer?tour=${encodeURIComponent(tourPackageId)}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { offer?: SaleOffer | null } | null) => {
        setState({ tour: tourPackageId, offer: body?.offer ?? null });
      })
      // Best effort: without an answer the form carries on at the regular price.
      .catch(() => {});
    return () => ctrl.abort();
  }, [tourPackageId, tourDate, enabled]);

  const offer = enabled && state?.tour === tourPackageId ? state.offer : null;
  const isOnSale = (date: string) => !!offer && !!date && !offer.excludedDates.includes(date);
  return { offer, isOnSale };
}
