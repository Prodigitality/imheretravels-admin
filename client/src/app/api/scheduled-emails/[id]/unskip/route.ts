import { requireStaff } from "@/lib/require-staff";
import { NextRequest, NextResponse } from "next/server";
import {
  db,
  doc,
  getDoc,
  updateDoc,
  Timestamp,
} from "@/lib/server-firestore";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const staff = await requireStaff(req.headers.get("authorization"));
  if (!staff.ok) {
    return NextResponse.json({ success: false, error: staff.error }, { status: staff.status });
  }

  try {
    const { id: scheduledEmailId } = await params;

    if (!scheduledEmailId) {
      return NextResponse.json(
        { success: false, error: "Scheduled email ID is required" },
        { status: 400 }
      );
    }

    // Get the scheduled email
    const scheduledEmailRef = doc(db, "scheduledEmails", scheduledEmailId);
    const scheduledEmailDoc = await getDoc(scheduledEmailRef);

    if (!scheduledEmailDoc.exists()) {
      return NextResponse.json(
        { success: false, error: "Scheduled email not found" },
        { status: 404 }
      );
    }

    const emailData = scheduledEmailDoc.data();

    // Check if email can be unskipped (must be skipped status)
    if (emailData?.status !== "skipped") {
      return NextResponse.json(
        { success: false, error: "Only skipped emails can be unskipped" },
        { status: 400 }
      );
    }

    // Update the status back to pending
    await updateDoc(scheduledEmailRef, {
      status: "pending",
      updatedAt: Timestamp.now(),
    });

    return NextResponse.json({
      success: true,
      message: "Scheduled email unskipped successfully",
      data: {
        id: scheduledEmailId,
        status: "pending",
      },
    });
  } catch (error) {
    console.error("Error unskipping scheduled email:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
