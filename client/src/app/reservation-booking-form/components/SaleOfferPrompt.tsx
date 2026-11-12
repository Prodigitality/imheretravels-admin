import { useState } from "react";
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
 * A date in an open sale is booked through the sale, never here at the regular
 * price: picking one sends the customer to the tour page's Hold sheet on that
 * date, or back to choose another. It can't be dismissed, so it shows every
 * time a sale date is picked.
 *
 * The one way past it is `price=regular` on the URL, which the Hold sheet adds
 * to its own "Book at regular price" links (the sale can't take the party, or
 * sold out); without it those customers would be sent straight back.
 */
export default function SaleOfferPrompt({
  offer,
  tourDate,
  active,
  onChooseAnotherDate,
}: {
  offer: SaleOffer | null;
  tourDate: string;
  /** The picked date is in the sale and the customer is still on the first step. */
  active: boolean;
  onChooseAnotherDate: () => void;
}) {
  const [regularChosen] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get("price") === "regular";
    } catch {
      return false;
    }
  });

  if (!offer || !active || regularChosen) return null;

  const tourPage = offer.tourSlug
    ? `${WWW_BASE}/tours/${offer.tourSlug}?sale=1&date=${tourDate}`
    : `${WWW_BASE}/${offer.saleSlug}`;

  return (
    <AlertDialog open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{dateLabel(tourDate)} is in our {offer.saleName}</AlertDialogTitle>
          <AlertDialogDescription>
            {offer.discountPct ? `Save ${offer.discountPct}%` : `Save up to ${gbp(offer.discountGBP)}`} on this date.{" "}
            {offer.left === 1 ? "1 sale place is" : `${offer.left} sale places are`} left. Sale dates are booked
            at the sale price: you&apos;ll hold your place on the tour page, then come back here to finish.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onChooseAnotherDate}>Choose another date</AlertDialogCancel>
          <AlertDialogAction asChild>
            <a href={tourPage}>Get the sale price</a>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
