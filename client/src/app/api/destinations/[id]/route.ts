import { requireStaff } from "@/lib/require-staff";
import { NextRequest, NextResponse } from "next/server";
import {
  db,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
} from "@/lib/server-firestore";
import { revalidateWww } from "@/lib/revalidate-www";
import { manilaLocalToDate } from "@/lib/manila-time";

const DESTINATIONS_COLLECTION = "destinations";

/**
 * GET /api/destinations/[id] - Get a single destination
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const staff = await requireStaff(request.headers.get("authorization"));
  if (!staff.ok) {
    return NextResponse.json({ success: false, error: staff.error }, { status: staff.status });
  }

  try {
    const { id } = await params;
    const docRef = doc(db, DESTINATIONS_COLLECTION, id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return NextResponse.json(
        { success: false, error: "Destination not found" },
        { status: 404 },
      );
    }

    const destination = { id: docSnap.id, ...docSnap.data() };
    return NextResponse.json({ success: true, destination });
  } catch (error) {
    console.error("Error fetching destination:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch destination",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/destinations/[id] - Update a destination (partial)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const staff = await requireStaff(request.headers.get("authorization"));
  if (!staff.ok) {
    return NextResponse.json({ success: false, error: staff.error }, { status: staff.status });
  }

  try {
    const currentUserId = staff.uid;

    const { id } = await params;
    const updates = await request.json();

    const docRef = doc(db, DESTINATIONS_COLLECTION, id);
    const now = Timestamp.now();

    const currentDoc = await getDoc(docRef);
    if (!currentDoc.exists()) {
      return NextResponse.json(
        { success: false, error: "Destination not found" },
        { status: 404 },
      );
    }

    const updateData: any = {
      ...updates,
      "metadata.updatedAt": now,
    };

    // Never let the client overwrite server-managed metadata wholesale.
    delete updateData.metadata;

    // Scheduled publish: the form's wall-clock value is interpreted as Asia/
    // Manila time, then persisted as a Timestamp (or cleared). The
    // publishScheduledDestinations cron flips status→"active" once it passes.
    if ("scheduledPublishAt" in updates) {
      const parsed = manilaLocalToDate(updates.scheduledPublishAt);
      updateData.scheduledPublishAt = parsed ? Timestamp.fromDate(parsed) : null;
    }

    await updateDoc(docRef, updateData);

    console.log(`✅ Updated destination ${id}`);

    await revalidateWww();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating destination:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to update destination",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/destinations/[id] - Delete a destination
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const staff = await requireStaff(request.headers.get("authorization"));
  if (!staff.ok) {
    return NextResponse.json({ success: false, error: staff.error }, { status: staff.status });
  }

  try {
    const currentUserId = staff.uid;

    const { id } = await params;
    const docRef = doc(db, DESTINATIONS_COLLECTION, id);

    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      return NextResponse.json(
        { success: false, error: "Destination not found" },
        { status: 404 },
      );
    }

    await deleteDoc(docRef);

    console.log(`✅ Deleted destination ${id}`);

    await revalidateWww();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting destination:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to delete destination",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
