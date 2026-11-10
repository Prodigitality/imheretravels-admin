import { requireStaff } from "@/lib/require-staff";
import { NextRequest, NextResponse } from "next/server";
import {
  db,
  doc,
  deleteDoc,
} from "@/lib/server-firestore";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const staff = await requireStaff(req.headers.get("authorization"));
  if (!staff.ok) {
    return NextResponse.json({ success: false, error: staff.error }, { status: staff.status });
  }

  try {
    const { id } = await params;
    
    if (!id) {
      return NextResponse.json(
        { success: false, error: "Transaction ID is required" },
        { status: 400 }
      );
    }

    console.log(`Deleting transaction with ID: ${id}`);
    
    // Delete from Firestore
    await deleteDoc(doc(db, "stripePayments", id));

    return NextResponse.json({
      success: true,
      message: "Transaction deleted successfully"
    });
  } catch (error: any) {
    console.error("Error deleting transaction:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete transaction" },
      { status: 500 }
    );
  }
}
