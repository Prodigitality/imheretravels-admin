import { requireStaff } from "@/lib/require-staff";
import { NextRequest, NextResponse } from "next/server";
import {
  db,
  collection,
  getDocs,
  addDoc,
  Timestamp,
} from "@/lib/server-firestore";
import type { DiscountEventItem } from "@/services/discount-events-service";

const COLLECTION = "discountEvents";

export async function GET(request: NextRequest) {
  const staff = await requireStaff(request.headers.get("authorization"));
  if (!staff.ok) {
    return NextResponse.json({ success: false, error: staff.error }, { status: staff.status });
  }

  try {
    const snap = await getDocs(collection(db, COLLECTION));
    const events: any[] = [];
    snap.forEach((d) => {
      events.push({ id: d.id, ...d.data() });
    });
    return NextResponse.json({ success: true, events });
  } catch (error) {
    console.error("Error fetching discount events:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch discount events" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const staff = await requireStaff(request.headers.get("authorization"));
  if (!staff.ok) {
    return NextResponse.json({ success: false, error: staff.error }, { status: staff.status });
  }

  try {
    const input: {
      name: string;
      active: boolean;
      items: DiscountEventItem[];
      bannerCover?: string;
      activationMode?: "manual" | "scheduled";
      scheduledStart?: string;
      scheduledEnd?: string;
      discountType?: "percent" | "amount";
    } = await request.json();

    const now = Timestamp.now();
    const activationMode = input.activationMode || "manual";

    const ref = await addDoc(collection(db, COLLECTION), {
      name: input.name,
      active: activationMode === "scheduled" ? true : input.active,
      items: input.items,
      bannerCover: input.bannerCover || "",
      activationMode,
      scheduledStart: input.scheduledStart || "",
      scheduledEnd: input.scheduledEnd || "",
      discountType: input.discountType || "percent",
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json({ success: true, id: ref.id });
  } catch (error) {
    console.error("Error creating discount event:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create discount event" },
      { status: 500 }
    );
  }
}
