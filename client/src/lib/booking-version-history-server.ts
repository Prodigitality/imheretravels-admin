import "server-only";

import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin-db";
import {
  SKIPPED_VERSION,
  VERSIONS_COLLECTION,
  buildBulkOperationDoc,
  buildVersionSnapshotDoc,
  type TimestampFactory,
} from "@/lib/booking-version-snapshot";
import type { SheetData } from "@/types/sheet-management";
import type { BulkOperationOptions, CreateVersionOptions } from "@/types/version-history";

/**
 * Version-history writes for API routes, through firebase-admin. Same
 * documents as `bookingVersionHistoryService` writes from the browser
 * (both use lib/booking-version-snapshot).
 */

const adminTimestamps: TimestampFactory = {
  now: () => Timestamp.now(),
  fromDate: (date) => Timestamp.fromDate(date),
};

/** Returns the new version id, or "__SKIPPED__" when nothing changed. */
export async function createVersionSnapshot(
  bookingId: string,
  documentSnapshot: SheetData,
  options: CreateVersionOptions,
  columns?: any[],
): Promise<string> {
  const versionDoc = buildVersionSnapshotDoc(bookingId, documentSnapshot, options, adminTimestamps, columns);
  if (versionDoc === SKIPPED_VERSION) return SKIPPED_VERSION;
  const ref = await adminDb().collection(VERSIONS_COLLECTION).add(versionDoc);
  return ref.id;
}

export async function createBulkOperationSnapshot(options: BulkOperationOptions): Promise<string> {
  const ref = await adminDb().collection(VERSIONS_COLLECTION).add(buildBulkOperationDoc(options, adminTimestamps));
  return ref.id;
}

/** Who to record on a version: the staff member's name from `users`, else their email. */
export async function staffDisplayName(uid: string): Promise<string> {
  try {
    const data = (await adminDb().collection("users").doc(uid).get()).data() as
      | { email?: string; profile?: { firstName?: string; lastName?: string } }
      | undefined;
    const first = data?.profile?.firstName;
    const last = data?.profile?.lastName;
    if (first && last) return `${first} ${last}`;
    return data?.email || "System";
  } catch {
    return "System";
  }
}
