import { requireStaff } from "@/lib/require-staff";
import { adminDb } from "@/lib/firebase-admin-db";
import { NextRequest, NextResponse } from "next/server";
import type { DocumentData, QueryDocumentSnapshot } from "firebase-admin/firestore";

/**
 * GET /api/tours/[id]/usage - What deleting this tour would affect.
 *
 * Backs the delete confirmation in the Tours list. Deleting a tour removes only
 * its tourPackages doc: bookings and reviews stay. But the website's review
 * form only offers tours that still exist, so travellers on a deleted tour can
 * no longer leave a review (www lib/booking-verify.ts). The dialog shows these
 * counts so the admin knows that before confirming.
 *
 * Booking matching mirrors www `bookingMatchesTour`: a booking's tourId is
 * decisive; bookings without one fall back to tour code, then tour name.
 */

const normalize = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Same buckets as www lib/booking-status.ts. */
function isCancelled(status: unknown): boolean {
  const s = typeof status === "string" ? status.toLowerCase() : "";
  return !s.includes("confirmed") && s.includes("cancelled");
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const staff = await requireStaff(request.headers.get("authorization"));
  if (!staff.ok) {
    return NextResponse.json({ success: false, error: staff.error }, { status: staff.status });
  }

  try {
    const { id } = await params;
    const db = adminDb();
    const tourSnap = await db.collection("tourPackages").doc(id).get();
    if (!tourSnap.exists) {
      return NextResponse.json({ success: false, error: "Tour not found" }, { status: 404 });
    }
    const tour = tourSnap.data() ?? {};
    const code = typeof tour.tourCode === "string" ? tour.tourCode.trim() : "";
    const name = typeof tour.name === "string" ? tour.name.trim() : "";
    const slug = typeof tour.slug === "string" ? tour.slug.trim() : "";

    const bookingsCol = db.collection("bookings");
    const reviewsCol = db.collection("tourReviews");
    const [byId, byCode, byName, reviewsById, reviewsBySlug] = await Promise.all([
      bookingsCol.where("tourId", "==", id).get(),
      code && normalize(code) !== "xxx"
        ? bookingsCol.where("tourCode", "==", code).get()
        : null,
      name ? bookingsCol.where("tourPackageName", "==", name).get() : null,
      reviewsCol.where("tourId", "==", id).get(),
      slug ? reviewsCol.where("tourSlug", "==", slug).get() : null,
    ]);

    const bookings = new Map<string, DocumentData>();
    for (const snap of [byId, byCode, byName]) {
      snap?.docs.forEach((d: QueryDocumentSnapshot) => {
        const b = d.data();
        const bTourId = String(b.tourId ?? "").trim();
        // A booking linked to another tour by id is not this tour's.
        if (bTourId && bTourId !== id) return;
        bookings.set(d.id, b);
      });
    }

    const reviews = new Map<string, DocumentData>();
    for (const snap of [reviewsById, reviewsBySlug]) {
      snap?.docs.forEach((d: QueryDocumentSnapshot) => {
        const r = d.data();
        const rTourId = String(r.tourId ?? "").trim();
        if (rTourId && rTourId !== id) return;
        reviews.set(d.id, r);
      });
    }
    const reviewedBookingIds = new Set(
      [...reviews.values()].map((r) => String(r.bookingId ?? "")).filter(Boolean),
    );

    let active = 0;
    let canStillReview = 0;
    for (const [docId, b] of bookings) {
      if (isCancelled(b.bookingStatus)) continue;
      active++;
      const bookingId = String(b.bookingId ?? docId);
      if (!reviewedBookingIds.has(bookingId) && !reviewedBookingIds.has(docId)) {
        canStillReview++;
      }
    }

    const published = [...reviews.values()].filter((r) => r.status === "published").length;

    return NextResponse.json({
      success: true,
      usage: {
        bookings: { total: bookings.size, active, canStillReview },
        reviews: { total: reviews.size, published },
      },
    });
  } catch (error) {
    console.error("Error checking tour usage:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to check tour usage",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
