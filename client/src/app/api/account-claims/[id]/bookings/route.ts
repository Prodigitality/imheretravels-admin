import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/require-staff";
import { adminDb } from "@/lib/firebase-admin-db";
import { searchBookings } from "@/lib/account-claims-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/account-claims/{id}/bookings?q=…: find the booking a manual-check
 * customer described, by exact booking reference or email.
 */
export async function GET(request: NextRequest, { params }: Ctx) {
  const staff = await requireStaff(request.headers.get("authorization"));
  if (!staff.ok) return NextResponse.json({ success: false, error: staff.error }, { status: staff.status });

  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
  const q = request.nextUrl.searchParams.get("q") ?? "";

  try {
    const claim = await adminDb().collection("accountClaims").doc(id).get();
    if (!claim.exists) return NextResponse.json({ success: false, error: "Case not found" }, { status: 404 });
    const data = await searchBookings(q, String(claim.get("userId") ?? ""));
    return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[account-claims] booking search failed", error);
    return NextResponse.json({ success: false, error: "Search failed" }, { status: 500 });
  }
}
