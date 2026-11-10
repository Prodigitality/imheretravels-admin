import { requireStaff } from "@/lib/require-staff";
import { NextRequest, NextResponse } from "next/server";
import {
  db,
  doc,
  updateDoc,
  increment as firestoreIncrement,
  Timestamp,
} from "@/lib/server-firestore";

const COLLECTION_NAME = "emailTemplates";

/**
 * POST /api/email-templates/[id]/increment-usage - Increment template usage count
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
      "metadata.usedCount": firestoreIncrement(1),
      "metadata.updatedAt": Timestamp.now(),
    });

    console.log(`✅ Incremented usage count for template ${id}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error incrementing template usage:", error);
    // Don't throw error for usage tracking failures - just log and continue
    return NextResponse.json(
      {
        success: false,
        error: "Failed to increment usage count",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
