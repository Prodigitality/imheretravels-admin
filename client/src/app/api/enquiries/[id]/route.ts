import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { requireStaff } from "@/lib/require-staff";
import { enquiriesCol, serializeEnquiry } from "@/lib/enquiries-server";
import { staffDisplayName } from "@/lib/partner-applications-server";
import { ENQUIRY_STATUSES, type EnquiryStatus } from "@/types/enquiries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_NOTE = 2000;

type Ctx = { params: Promise<{ id: string }> };

function validId(id: string | undefined): id is string {
  return !!id && /^[A-Za-z0-9_-]{1,64}$/.test(id);
}

/** PATCH { status?, note? }: change follow-up status and/or add an internal note. */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const staff = await requireStaff(request.headers.get("authorization"));
  if (!staff.ok) return NextResponse.json({ success: false, error: staff.error }, { status: staff.status });

  const { id } = await params;
  if (!validId(id)) return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });

  let body: { status?: unknown; note?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (body.status !== undefined) {
    if (!ENQUIRY_STATUSES.includes(body.status as EnquiryStatus)) {
      return NextResponse.json({ success: false, error: "Invalid status" }, { status: 400 });
    }
    update.status = body.status;
    update.statusChangedBy = staff.uid;
    update.statusChangedAt = FieldValue.serverTimestamp();
  }
  if (body.note !== undefined) {
    const text = typeof body.note === "string" ? body.note.trim() : "";
    if (!text || text.length > MAX_NOTE) {
      return NextResponse.json({ success: false, error: `Note must be 1–${MAX_NOTE} characters` }, { status: 400 });
    }
    update.notes = FieldValue.arrayUnion({
      text,
      by: staff.uid,
      byName: await staffDisplayName(staff.uid),
      at: Timestamp.now(),
    });
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ success: false, error: "Nothing to update" }, { status: 400 });
  }
  update.updatedAt = FieldValue.serverTimestamp();

  const ref = enquiriesCol().doc(id);
  try {
    await ref.update(update);
  } catch (error) {
    const code = (error as { code?: number }).code;
    if (code === 5) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    console.error("[enquiries] update failed", error);
    return NextResponse.json({ success: false, error: "Failed to update" }, { status: 500 });
  }
  return NextResponse.json({ success: true, data: serializeEnquiry(await ref.get()) });
}
