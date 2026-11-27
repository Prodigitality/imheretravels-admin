import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/require-staff";
import { createShare, disableShare, getShare } from "@/lib/website-visits-share";

/**
 * The private no-login link to the Website visits report (staff only).
 * GET: current link. POST: create or replace it (the old one stops working).
 * DELETE: turn it off. See lib/website-visits-share.ts.
 */
export const dynamic = "force-dynamic";

async function handle(request: NextRequest, action: (uid: string) => Promise<unknown>) {
  const staff = await requireStaff(request.headers.get("authorization"));
  if (!staff.ok) {
    return NextResponse.json({ success: false, error: staff.error }, { status: staff.status });
  }
  try {
    await action(staff.uid);
    const share = await getShare();
    return NextResponse.json({ success: true, share }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[website-visits] share failed", error);
    return NextResponse.json({ success: false, error: "Couldn't update the link" }, { status: 500 });
  }
}

export function GET(request: NextRequest) {
  return handle(request, async () => {});
}

export function POST(request: NextRequest) {
  return handle(request, createShare);
}

export function DELETE(request: NextRequest) {
  return handle(request, disableShare);
}
