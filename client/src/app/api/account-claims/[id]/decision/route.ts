import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/require-staff";
import { decideClaim } from "@/lib/account-claims-server";
import { staffDisplayName } from "@/lib/partner-applications-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/account-claims/{id}/decision
 * { action: "approve" | "needs_evidence" | "reject", reasonCode, note?,
 *   bookingDocumentId? (manual checks), revokeExisting?, emailCustomer? }
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  const staff = await requireStaff(request.headers.get("authorization"));
  if (!staff.ok) return NextResponse.json({ success: false, error: staff.error }, { status: staff.status });

  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const result = await decideClaim(id, body, { uid: staff.uid, name: await staffDisplayName(staff.uid) });
    if (!result.ok) return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    return NextResponse.json({ success: true, state: result.state, emails: result.emails });
  } catch (error) {
    console.error("[account-claims] decision failed", error);
    return NextResponse.json({ success: false, error: "Failed to save the decision" }, { status: 500 });
  }
}
