"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { getTourUsage, type TourUsage } from "@/services/tours-service";
import type { TourPackage } from "@/types/tours";

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/**
 * Delete confirmation for a tour package, showing what the delete affects.
 *
 * Deleting removes only the tourPackages doc. Reviews and bookings are kept,
 * and reviews stay on the website's Reviews page. But the website's review form
 * only offers tours that still exist, so travellers booked on a deleted tour
 * can no longer leave a review. Archiving takes the tour off the website and
 * keeps the review form open, so it is offered as the alternative.
 */
export default function DeleteTourDialog({
  tour,
  open,
  onOpenChange,
  onDelete,
  onArchive,
}: {
  tour: TourPackage | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: () => Promise<void>;
  onArchive: (tour: TourPackage) => Promise<void>;
}) {
  const [usage, setUsage] = useState<TourUsage | null>(null);
  const [usageError, setUsageError] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState<"delete" | "archive" | null>(null);

  const tourId = tour?.id;
  useEffect(() => {
    if (!open || !tourId) return;
    let cancelled = false;
    setUsage(null);
    setUsageError(false);
    setAcknowledged(false);
    getTourUsage(tourId)
      .then((u) => !cancelled && setUsage(u))
      .catch((err) => {
        console.error("Error checking tour usage:", err);
        if (!cancelled) setUsageError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, tourId]);

  const loading = open && !usage && !usageError;
  const affected = usage?.bookings.canStillReview ?? 0;
  // Ask for an explicit tick whenever travellers would lose the review form,
  // or when we couldn't check.
  const needsAck = usageError || affected > 0;
  const canDelete = !loading && !busy && (!needsAck || acknowledged);

  const run = async (kind: "delete" | "archive") => {
    if (!tour) return;
    setBusy(kind);
    try {
      if (kind === "delete") await onDelete();
      else {
        await onArchive(tour);
        onOpenChange(false);
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <AlertDialogContent className="border border-royal-purple/20 dark:border-border">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-foreground">
            Delete &ldquo;{tour?.name}&rdquo;?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground">
            This removes the tour package and its page on the website. It
            can&rsquo;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 text-sm text-foreground">
          {loading && (
            <p className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking bookings and reviews for this tour…
            </p>
          )}

          {usageError && (
            <p className="flex gap-2 rounded-md border border-vivid-orange/30 bg-vivid-orange/10 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-vivid-orange" />
              <span>
                Couldn&rsquo;t check this tour&rsquo;s bookings and reviews.
                Its reviews will be kept, but travellers booked on it will no
                longer be able to leave a review.
              </span>
            </p>
          )}

          {usage && (
            <ul className="list-disc space-y-2 pl-5">
              <li>
                {usage.reviews.published > 0 ? (
                  <>
                    <strong>
                      {plural(usage.reviews.published, "published review", "published reviews")}
                    </strong>{" "}
                    will be kept and stay on the website&rsquo;s Reviews page.
                    The tour&rsquo;s own page will be removed.
                  </>
                ) : (
                  "This tour has no published reviews."
                )}
              </li>
              <li>
                {affected > 0 ? (
                  <>
                    <strong>
                      {plural(affected, "traveller", "travellers")}
                    </strong>{" "}
                    booked on this tour {affected === 1 ? "hasn't" : "haven't"}{" "}
                    left a review yet and will{" "}
                    <strong>no longer be able to leave one</strong>.
                  </>
                ) : usage.bookings.total > 0 ? (
                  `${plural(usage.bookings.total, "booking is", "bookings are")} kept. None can still leave a review (already reviewed or cancelled).`
                ) : (
                  "No bookings are linked to this tour."
                )}
              </li>
            </ul>
          )}

          {needsAck && tour?.status !== "archived" && (
            <p className="text-muted-foreground">
              To keep the review form open for them, archive the tour instead:
              it comes off the website but can still be reviewed.
            </p>
          )}

          {needsAck && (
            <label className="flex cursor-pointer items-start gap-2">
              <Checkbox
                checked={acknowledged}
                onCheckedChange={(v) => setAcknowledged(v === true)}
                disabled={!!busy}
                className="mt-0.5"
              />
              <span>
                I understand travellers on this tour will no longer be able to
                leave a review.
              </span>
            </label>
          )}
        </div>

        <AlertDialogFooter className="gap-2 sm:gap-0">
          <AlertDialogCancel
            disabled={!!busy}
            className="border-royal-purple/20 text-royal-purple hover:bg-royal-purple/10 hover:border-royal-purple"
          >
            Cancel
          </AlertDialogCancel>
          {tour && tour.status !== "archived" && (
            <Button
              variant="outline"
              disabled={!!busy}
              onClick={() => run("archive")}
            >
              {busy === "archive" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Archive instead
            </Button>
          )}
          <Button
            disabled={!canDelete}
            onClick={() => run("delete")}
            className="bg-crimson-red hover:bg-crimson-red/90 text-white"
          >
            {busy === "delete" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete permanently
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
