import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/require-staff";
import { adminDb } from "@/lib/firebase-admin-db";
import { getTeamRecipients, saveTeamRecipients } from "@/lib/team-recipients-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET/PUT /api/settings/team-notifications: who gets the team emails for
 * enquiries, contact messages, slot holds and deposits (lib/team-recipients.ts).
 * Reading needs approved staff; changing needs an admin or the
 * "Manage emails" permission (the Settings → Email Settings tab).
 */
export async function GET(request: NextRequest) {
  const staff = await requireStaff(request.headers.get("authorization"));
  if (!staff.ok) return NextResponse.json({ success: false, error: staff.error }, { status: staff.status });
  try {
    return NextResponse.json({ success: true, recipients: await getTeamRecipients() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[team-notifications] read failed", e);
    return NextResponse.json({ success: false, error: "Failed to load the recipients" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const staff = await requireStaff(request.headers.get("authorization"));
  if (!staff.ok) return NextResponse.json({ success: false, error: staff.error }, { status: staff.status });

  if (staff.role !== "admin") {
    const user = await adminDb().collection("users").doc(staff.uid).get();
    if (user.get("permissions.canManageEmails") !== true) {
      return NextResponse.json({ success: false, error: "You need the Manage emails permission" }, { status: 403 });
    }
  }

  const body = (await request.json().catch(() => null)) as { recipients?: unknown } | null;
  if (!body || !Array.isArray(body.recipients)) {
    return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });
  }
  try {
    const recipients = await saveTeamRecipients(body.recipients, staff.uid);
    return NextResponse.json({ success: true, recipients });
  } catch (e) {
    console.error("[team-notifications] save failed", e);
    return NextResponse.json({ success: false, error: "Failed to save the recipients" }, { status: 500 });
  }
}
