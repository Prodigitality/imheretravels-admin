import { NextRequest, NextResponse } from "next/server";
import { isValidShareToken } from "@/lib/website-visits-share";
import { getWebsiteVisitsReport, normaliseRange, ReportRangeError } from "@/lib/website-visits-server";

/**
 * GET /api/public/website-visits/[token]?start&end
 * The Website visits report for the private agency link: no login, but the
 * token must match the current enabled link. Returns visit counts only.
 */
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    if (!(await isValidShareToken(token))) {
      return NextResponse.json({ success: false, error: "This link is no longer active." }, { status: 404, headers });
    }
    const { searchParams } = request.nextUrl;
    const { start, end } = normaliseRange(searchParams.get("start"), searchParams.get("end"));
    const report = await getWebsiteVisitsReport(start, end);
    return NextResponse.json({ success: true, report }, { headers });
  } catch (error) {
    if (error instanceof ReportRangeError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400, headers });
    }
    console.error("[website-visits] public report failed", error);
    return NextResponse.json({ success: false, error: "Couldn't load the report" }, { status: 500, headers });
  }
}
