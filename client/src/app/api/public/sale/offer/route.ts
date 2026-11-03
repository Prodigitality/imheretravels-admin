import { NextRequest } from "next/server";
import { findSaleOffer } from "@/lib/sale/sales";
import { errorResponse, json, preflight } from "@/lib/sale/http";

/**
 * Public: whether a tour (and, with `date`, that date) can be booked in an open
 * sale right now. The reservation form tags sale dates and stops regular-price
 * bookings of them.
 */
export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

export async function GET(req: NextRequest) {
  const tour = req.nextUrl.searchParams.get("tour") ?? "";
  const date = req.nextUrl.searchParams.get("date") ?? "";
  if (!/^[A-Za-z0-9]{1,64}$/.test(tour) || (date && !/^\d{4}-\d{2}-\d{2}$/.test(date))) {
    return json(req, { error: "invalid_request" }, { status: 400 });
  }
  try {
    const offer = await findSaleOffer(tour, date || undefined);
    return json(req, { offer }, { headers: { "Cache-Control": "public, s-maxage=5, stale-while-revalidate=5" } });
  } catch (e) {
    return errorResponse(req, e, "offer");
  }
}
