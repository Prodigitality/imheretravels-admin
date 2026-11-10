import { requireStaff } from "@/lib/require-staff";
import { NextRequest, NextResponse } from "next/server";
import {
  db,
  doc,
  getDoc,
  deleteDoc,
  setDoc,
} from "@/lib/server-firestore";
import { createVersionSnapshot, staffDisplayName } from "@/lib/booking-version-history-server";

const COLLECTION_NAME = "bookings";

/**
 * POST /api/bookings/[id]/clear - Clear all fields from a booking except essential ones
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

    // Get the current document to preserve id, createdAt, updatedAt
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return NextResponse.json(
        { success: false, error: "Booking document does not exist" },
        { status: 404 }
      );
    }

    const currentData = docSnap.data();
    console.log(`🔍 Current data for booking ${id}:`, currentData);

    // Keep only essential fields: id, createdAt, updatedAt
    const preservedFields: Record<string, any> = {
      id: currentData.id || id,
      createdAt: currentData.createdAt || new Date(),
      updatedAt: new Date(),
    };

    console.log(`🔒 Preserved fields:`, preservedFields);
    console.log(
      `🧹 Fields being cleared:`,
      Object.keys(currentData).filter(
        (key) => key !== "id" && key !== "createdAt" && key !== "updatedAt"
      )
    );

    // Create version snapshot before clearing fields
    const currentBookingWithId = { id, ...currentData };
    createVersionSnapshotAsync(
      staff.uid,
      id,
      currentBookingWithId,
      preservedFields,
      "update",
      `Cleared all fields except id, createdAt, updatedAt`
    );

    // Delete the document and recreate it with only essential fields
    await deleteDoc(docRef);
    await setDoc(docRef, preservedFields);

    console.log(
      `✅ Cleared all fields from booking ${id}, preserved essential fields`
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error clearing booking fields:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to clear booking fields",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * Helper: Create version snapshot asynchronously
 */
async function createVersionSnapshotAsync(
  authorUid: string,
  bookingId: string,
  currentBooking: Record<string, any>,
  preservedFields: Record<string, any>,
  changeType: "update",
  customDescription: string
): Promise<void> {
  try {
    const currentUserId = authorUid;
    const currentUserName = await staffDisplayName(authorUid);

    await createVersionSnapshot(
      bookingId,
      currentBooking as any,
      {
        changeType,
        changeDescription: customDescription,
        userId: currentUserId,
        userName: currentUserName,
      }
    );

    console.log(`✅ [ASYNC] Version snapshot created for ${bookingId}`);
  } catch (error) {
    console.error(
      `❌ [ASYNC] Failed to create version snapshot for ${bookingId}:`,
      error
    );
  }
}
