import { requireStaff } from "@/lib/require-staff";
import { NextRequest, NextResponse } from "next/server";
import {
  db,
  doc,
  updateDoc,
  Timestamp,
} from "@/lib/server-firestore";

const COLLECTION_NAME = "emailTemplates";

/**
 * POST /api/email-templates/[id]/archive - Archive an email template (soft delete)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const staff = await requireStaff(request.headers.get("authorization"));
  if (!staff.ok) {
    return NextResponse.json({ success: false, error: staff.error }, { status: staff.status });
  }

  try {
    const { id } = await params;
    const docRef = doc(db, COLLECTION_NAME, id);

    await updateDoc(docRef, {
      status: "archived",
      "metadata.updatedAt": Timestamp.now(),
    });

    console.log(`✅ Archived email template ${id}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error archiving email template:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to archive email template",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
