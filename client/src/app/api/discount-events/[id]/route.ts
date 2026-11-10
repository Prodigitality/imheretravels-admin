import { requireStaff } from "@/lib/require-staff";
import { NextRequest, NextResponse } from "next/server";
import {
  db,
  doc,
  updateDoc,
  deleteDoc,
  Timestamp,
} from "@/lib/server-firestore";

const COLLECTION = "discountEvents";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const staff = await requireStaff(request.headers.get("authorization"));
  if (!staff.ok) {
    return NextResponse.json({ success: false, error: staff.error }, { status: staff.status });
  }

  try {
    const { id } = await params;
    const body = await request.json();

    await updateDoc(doc(db, COLLECTION, id), {
      ...body,
      updatedAt: Timestamp.now(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating discount event:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update discount event" },
      { status: 500 }
    );
  }
}

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
    await deleteDoc(doc(db, COLLECTION, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting discount event:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete discount event" },
      { status: 500 }
    );
  }
}
