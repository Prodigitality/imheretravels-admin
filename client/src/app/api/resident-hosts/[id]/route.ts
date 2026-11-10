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
import { encodeGallerySlides, decodeGallerySlides } from "@/lib/resident-hosts-gallery";
import { revalidateWww } from "@/lib/revalidate-www";

const RESIDENT_HOSTS_COLLECTION = "residentHost";

/**
 * GET /api/resident-hosts/[id] - Get a single resident host
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
    const docRef = doc(db, RESIDENT_HOSTS_COLLECTION, id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return NextResponse.json(
        { success: false, error: "Resident host not found" },
        { status: 404 },
      );
    }

    const data = docSnap.data() as any;
    // Decode the stored array-of-maps gallery back to the editor [][][] shape.
    if (data.gallerySlides !== undefined) {
      data.gallerySlides = decodeGallerySlides(data.gallerySlides);
    }
    const host = { id: docSnap.id, ...data };
    return NextResponse.json({ success: true, host });
  } catch (error) {
    console.error("Error fetching resident host:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch resident host",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/resident-hosts/[id] - Update a resident host (partial)
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

    const docRef = doc(db, RESIDENT_HOSTS_COLLECTION, id);
    const now = Timestamp.now();

    const currentDoc = await getDoc(docRef);
    if (!currentDoc.exists()) {
      return NextResponse.json(
        { success: false, error: "Resident host not found" },
        { status: 404 },
      );
    }

    const updateData: any = {
      ...updates,
      "metadata.updatedAt": now,
    };

    // Never let the client overwrite server-managed metadata wholesale.
    delete updateData.metadata;

    // Firestore forbids nested arrays — store gallerySlides as array-of-maps.
    if (updates.gallerySlides !== undefined) {
      updateData.gallerySlides = encodeGallerySlides(updates.gallerySlides);
    }

    await updateDoc(docRef, updateData);

    console.log(`✅ Updated resident host ${id}`);

    await revalidateWww();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating resident host:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to update resident host",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/resident-hosts/[id] - Delete a resident host
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
    const docRef = doc(db, RESIDENT_HOSTS_COLLECTION, id);

    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      return NextResponse.json(
        { success: false, error: "Resident host not found" },
        { status: 404 },
      );
    }

    await deleteDoc(docRef);

    console.log(`✅ Deleted resident host ${id}`);

    await revalidateWww();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting resident host:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to delete resident host",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
