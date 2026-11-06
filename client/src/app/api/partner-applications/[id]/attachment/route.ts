import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/require-staff";
import { adminBucket } from "@/lib/firebase-admin-db";
import { partnerApplicationsCol } from "@/lib/partner-applications-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const URL_TTL_MS = 10 * 60_000;

/**
 * GET /api/partner-applications/[id]/attachment: a 10-minute signed URL for the
 * supplier's uploaded document. The file lives under partner-applications/,
 * which storage.rules keeps server-only, so this is the only way to open it.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff(request.headers.get("authorization"));
  if (!staff.ok) return NextResponse.json({ success: false, error: staff.error }, { status: staff.status });

  const { id } = await params;
  if (!id || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
    return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
  }

  const snap = await partnerApplicationsCol().doc(id).get();
  const att = snap.data()?.attachment as { path?: string; name?: string; bucket?: string } | undefined;
  if (!snap.exists || !att?.path || !att.path.startsWith(`partner-applications/${id}/`)) {
    return NextResponse.json({ success: false, error: "No attachment" }, { status: 404 });
  }

  try {
    const defaultBucket = adminBucket();
    // www records which bucket it wrote to; normally the same default bucket.
    const bucket =
      att.bucket && att.bucket !== defaultBucket.name ? defaultBucket.storage.bucket(att.bucket) : defaultBucket;
    const safeName = (att.name || "document").replace(/["\r\n]/g, "_");
    const [url] = await bucket.file(att.path).getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + URL_TTL_MS,
      responseDisposition: `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
    });
    return NextResponse.json({ success: true, url }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[partner-applications] signed URL failed", error);
    return NextResponse.json({ success: false, error: "Could not open the file" }, { status: 500 });
  }
}
