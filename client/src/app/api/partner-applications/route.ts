import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/require-staff";
import {
  partnerApplicationsCol,
  serializePartnerApplication,
} from "@/lib/partner-applications-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_DOCS = 1000;

/**
 * GET /api/partner-applications: staff-only list of Work With Us applications,
 * newest first. Filtering (type / status / search) happens in the UI; volumes
 * are small and this avoids composite indexes.
 */
export async function GET(request: NextRequest) {
  const staff = await requireStaff(request.headers.get("authorization"));
  if (!staff.ok) {
    return NextResponse.json({ success: false, error: staff.error }, { status: staff.status });
  }

  try {
    const snap = await partnerApplicationsCol().orderBy("createdAt", "desc").limit(MAX_DOCS).get();
    return NextResponse.json(
      { success: true, data: snap.docs.map(serializePartnerApplication), truncated: snap.size >= MAX_DOCS },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[partner-applications] list failed", error);
    return NextResponse.json({ success: false, error: "Failed to load applications" }, { status: 500 });
  }
}
