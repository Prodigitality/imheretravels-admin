import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/require-staff";
import { listClaims } from "@/lib/account-claims-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/account-claims: staff-only list of customer-portal booking claims, newest first. */
export async function GET(request: NextRequest) {
  const staff = await requireStaff(request.headers.get("authorization"));
  if (!staff.ok) return NextResponse.json({ success: false, error: staff.error }, { status: staff.status });

  try {
    const { claims, truncated } = await listClaims();
    return NextResponse.json({ success: true, data: claims, truncated }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[account-claims] list failed", error);
    return NextResponse.json({ success: false, error: "Failed to load cases" }, { status: 500 });
  }
}
