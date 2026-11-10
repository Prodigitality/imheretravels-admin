import { requireStaff } from "@/lib/require-staff";
import { NextRequest, NextResponse } from "next/server";
import {
  db,
  doc,
  getDoc,
  updateDoc,
  Timestamp,
} from "@/lib/server-firestore";
import type { PreDepartureConfig } from "@/types/pre-departure-pack";

const CONFIG_COLLECTION = "config";
const CONFIG_DOC = "pre-departure";

/**
 * GET /api/pre-departure-packs/config - Get pre-departure configuration
 */
export async function GET(request: NextRequest) {
  const staff = await requireStaff(request.headers.get("authorization"));
  if (!staff.ok) {
    return NextResponse.json({ success: false, error: staff.error }, { status: staff.status });
  }

  try {
    const docRef = doc(db, CONFIG_COLLECTION, CONFIG_DOC);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      // Return default config
      return NextResponse.json({
        success: true,
        config: {
          automaticSends: false,
        },
      });
    }

    const config = docSnap.data() as PreDepartureConfig;

    return NextResponse.json({ success: true, config });
  } catch (error) {
    console.error("Error fetching pre-departure config:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch configuration",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/pre-departure-packs/config - Update pre-departure configuration
 */
export async function PATCH(request: NextRequest) {
  const staff = await requireStaff(request.headers.get("authorization"));
  if (!staff.ok) {
    return NextResponse.json({ success: false, error: staff.error }, { status: staff.status });
  }

  try {
    const { automaticSends } = await request.json();

    if (typeof automaticSends !== "boolean") {
      return NextResponse.json(
        { success: false, error: "automaticSends must be a boolean" },
        { status: 400 }
      );
    }

    const userId = staff.uid;

    const docRef = doc(db, CONFIG_COLLECTION, CONFIG_DOC);

    await updateDoc(docRef, {
      automaticSends,
      lastUpdated: Timestamp.now(),
      updatedBy: userId,
    });

    console.log("✅ Updated pre-departure config");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating pre-departure config:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to update configuration",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
