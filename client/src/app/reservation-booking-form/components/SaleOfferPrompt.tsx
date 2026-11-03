import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { SaleOffer } from "@/lib/sale/sales";

const WWW_BASE = process.env.NEXT_PUBLIC_WWW_URL || "https://imheretravels.com";

const gbp = (n: number) =>
  `£${n.toLocaleString("en-GB", { maximumFractionDigits: 2 })}`;

const dateLabel = (key: string) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

/**
 * Tells a customer booking at the regular price that the tour date they picked
 * is in an open sale, and offers the way in. The tour page sends dates left out
 * of the sale straight here, so changing the date in the form is the only way
 * to reach a sale date without seeing the sale; this closes that gap.
 */
export default function SaleOfferPrompt({
  tourPackageId,
  tourDate,
  enabled,
}: {
  tourPackageId: string;
  tourDate: string;
  /** Off during a sale hold, after payment, and past the first step. */
  enabled: boolean;
}) {
  const key = enabled && tourPackageId && /^\d{4}-\d{2}-\d{2}$/.test(tourDate) ? `${tourPackageId}|${tourDate}` : null;
  const [offer, setOffer] = useState<{ key: string; offer: SaleOffer } | null>(null);
  // Each tour date asks once; "Continue at regular price" means it.
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!key || dismissed.has(key)) return;
    const [tour, date] = key.split("|");
    const ctrl = new AbortController();
    fetch(`/api/public/sale/offer?tour=${encodeURIComponent(tour)}&date=${date}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { offer: SaleOffer | null } | null) => {
        setOffer(body?.offer ? { key, offer: body.offer } : null);
      })
      // Best effort: without an answer the form simply carries on.
      .catch(() => {});
    return () => ctrl.abort();
  }, [key, dismissed]);

  const shown = offer && offer.key === key && !dismissed.has(offer.key) ? offer.offer : null;
  const dismiss = () => {
    if (key) setDismissed((prev) => new Set(prev).add(key));
  };

  if (!shown) return null;
  const href = shown.tourSlug ? `${WWW_BASE}/tours/${shown.tourSlug}` : `${WWW_BASE}/${shown.saleSlug}`;

  return (
    <AlertDialog open onOpenChange={(open) => !open && dismiss()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{dateLabel(tourDate)} is in our {shown.saleName}</AlertDialogTitle>
          <AlertDialogDescription>
            Save {gbp(shown.discountGBP)} on this tour with a sale place.{" "}
            {shown.left === 1 ? "1 place is" : `${shown.left} places are`} left. Sale places are reserved on the
            tour page, where you hold yours while you pay.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={dismiss}>Continue at regular price</AlertDialogCancel>
          <AlertDialogAction asChild>
            <a href={href}>Get the sale price</a>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
