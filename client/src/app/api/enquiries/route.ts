import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/require-staff";
import { enquiriesCol, serializeEnquiry } from "@/lib/enquiries-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_DOCS = 1000;

/**
 * GET /api/enquiries: staff-only list of tour enquiries, newest first.
 * Filtering (status / search) happens in the UI.
 */
export async function GET(request: NextRequest) {
  const staff = await requireStaff(request.headers.get("authorization"), { allowViewer: true });
  if (!staff.ok) {
    return NextResponse.json({ success: false, error: staff.error }, { status: staff.status });
  }

  try {
    const snap = await enquiriesCol().orderBy("createdAt", "desc").limit(MAX_DOCS).get();
    return NextResponse.json(
      { success: true, data: snap.docs.map(serializeEnquiry), truncated: snap.size >= MAX_DOCS },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[enquiries] list failed", error);
    return NextResponse.json({ success: false, error: "Failed to load enquiries" }, { status: 500 });
  }
}
