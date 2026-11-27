import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/require-staff";
import { getWebsiteVisitsReport, normaliseRange, ReportRangeError } from "@/lib/website-visits-server";

/**
 * GET /api/reports/website-visits?start=YYYY-MM-DD&end=YYYY-MM-DD
 * Staff only. Manila dates, inclusive. See lib/website-visits-server.ts.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const staff = await requireStaff(request.headers.get("authorization"));
  if (!staff.ok) {
    return NextResponse.json({ success: false, error: staff.error }, { status: staff.status });
  }
  try {
    const { searchParams } = request.nextUrl;
    const { start, end } = normaliseRange(searchParams.get("start"), searchParams.get("end"));
    const report = await getWebsiteVisitsReport(start, end);
    return NextResponse.json({ success: true, report }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ReportRangeError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error("[website-visits] report failed", error);
    return NextResponse.json({ success: false, error: "Couldn't load the report" }, { status: 500 });
  }
}
