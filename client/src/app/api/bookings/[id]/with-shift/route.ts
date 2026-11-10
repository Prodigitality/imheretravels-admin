import { requireStaff } from "@/lib/require-staff";
import { NextRequest, NextResponse } from "next/server";
import {
  db,
  doc,
  getDoc,
  deleteDoc,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  writeBatch,
} from "@/lib/server-firestore";
import { createVersionSnapshot, staffDisplayName } from "@/lib/booking-version-history-server";

const COLLECTION_NAME = "bookings";

/**
 * DELETE /api/bookings/[id]/with-shift - Delete booking and shift subsequent rows
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const staff = await requireStaff(request.headers.get("authorization"));
  if (!staff.ok) {
    return NextResponse.json({ success: false, error: staff.error }, { status: staff.status });
  }

  try {
    const { id } = await params;

    console.log(`🗑️ Starting delete with row shift for booking ${id}...`);

    // Get the booking to find its row number
    const bookingDoc = await getDoc(doc(db, COLLECTION_NAME, id));
    if (!bookingDoc.exists()) {
      return NextResponse.json(
        { success: false, error: "Booking document does not exist" },
        { status: 404 }
      );
    }

    const bookingData = bookingDoc.data();
    const deletedRowNumber = bookingData.row;

    if (typeof deletedRowNumber !== "number") {
      console.warn(
        `⚠️ Booking ${id} has no valid row number, deleting without shifting`
      );

      // Create version snapshot before deletion even without row shifting
      const currentBookingWithId = { id, ...bookingData };
      await createVersionSnapshotAsync(
        staff.uid,
        id,
        currentBookingWithId,
        "delete",
        "Booking deleted (no row shift)"
      );

      // Clean up scheduled emails before deleting
      await cleanupScheduledEmails(id);

      await deleteDoc(doc(db, COLLECTION_NAME, id));
      return NextResponse.json({ success: true, rowsShifted: 0 });
    }

    console.log(`📍 Deleting booking at row ${deletedRowNumber}`);

    // Get all bookings with row numbers greater than the deleted row
    const bookingsRef = collection(db, COLLECTION_NAME);
    const q = query(
      bookingsRef,
      where("row", ">", deletedRowNumber),
      orderBy("row", "asc")
    );

    const snapshot = await getDocs(q);
    const bookingsToUpdate = snapshot.docs.map((doc) => ({
      id: doc.id,
      data: doc.data(),
      row: doc.data().row,
    }));

    console.log(`📊 Found ${bookingsToUpdate.length} bookings to shift down`);

    // Create version snapshot before deletion with row shifting
    const currentBookingWithId = { id, ...bookingData };
    await createVersionSnapshotAsync(
      staff.uid,
      id,
      currentBookingWithId,
      "delete",
      `Deleted booking at row ${deletedRowNumber} with row shifting`
    );

    // Clean up scheduled emails before deleting
    await cleanupScheduledEmails(id);

    // Delete the original booking
    await deleteDoc(doc(db, COLLECTION_NAME, id));

    // If no bookings to shift, we're done
    if (bookingsToUpdate.length === 0) {
      console.log(
        `✅ Deleted booking at row ${deletedRowNumber}, no rows to shift`
      );
      return NextResponse.json({ success: true, rowsShifted: 0 });
    }

    // Use batch writes to shift all subsequent rows down by 1
    const BATCH_SIZE = 400;
    for (let i = 0; i < bookingsToUpdate.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      const slice = bookingsToUpdate.slice(i, i + BATCH_SIZE);

      slice.forEach(({ id, data }) => {
        const newRowNumber = data.row - 1;
        const docRef = doc(db, COLLECTION_NAME, id);
        batch.update(docRef, {
          row: newRowNumber,
          updatedAt: new Date(),
        });
      });

      await batch.commit();
      console.log(
        `✅ Shifted batch ${Math.floor(i / BATCH_SIZE) + 1}: rows ${
          slice[0].row
        }-${slice[slice.length - 1].row} → ${slice[0].row - 1}-${
          slice[slice.length - 1].row - 1
        }`
      );
    }

    console.log(
      `✅ Successfully deleted booking at row ${deletedRowNumber} and shifted ${bookingsToUpdate.length} subsequent rows down`
    );

    return NextResponse.json({
      success: true,
      rowsShifted: bookingsToUpdate.length,
    });
  } catch (error) {
    console.error("Error deleting booking with row shift:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to delete booking with row shift",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * Helper: Clean up scheduled payment reminder emails
 */
async function cleanupScheduledEmails(bookingId: string): Promise<void> {
  try {
    console.log(`🧹 Cleaning up scheduled emails for booking ${bookingId}...`);

    const scheduledEmailsRef = collection(db, "scheduledEmails");
    const q = query(
      scheduledEmailsRef,
      where("bookingId", "==", bookingId),
      where("emailType", "==", "payment-reminder")
    );

    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      console.log(`No scheduled emails found for booking ${bookingId}`);
      return;
    }

    console.log(
      `Found ${snapshot.docs.length} scheduled emails to delete for booking ${bookingId}`
    );

    const batch = writeBatch(db);
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    await batch.commit();
    console.log(
      `✅ Successfully deleted ${snapshot.docs.length} scheduled emails for booking ${bookingId}`
    );
  } catch (error) {
    console.error(
      `⚠️ Error cleaning up scheduled emails for booking ${bookingId}:`,
      error
    );
  }
}

/**
 * Helper: Create version snapshot
 */
async function createVersionSnapshotAsync(
  authorUid: string,
  bookingId: string,
  currentBooking: Record<string, any>,
  changeType: "delete",
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

    console.log(`✅ Version snapshot created for ${bookingId}`);
  } catch (error) {
    console.error(
      `❌ Failed to create version snapshot for ${bookingId}:`,
      error
    );
  }
}
