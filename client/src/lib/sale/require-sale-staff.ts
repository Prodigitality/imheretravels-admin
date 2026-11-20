import "server-only";

import { adminDb } from "@/lib/firebase-admin-db";
import { requireStaff, type RequireStaffResult } from "@/lib/require-staff";

/**
 * Sale admin: any approved staff can view, and so can a read-only viewer
 * (lib/viewer-access.ts: the sale editor's slot tracker). Editing needs the
 * same `canManageTours` permission that guards the Tours page, and never
 * lets a viewer through (requireStaff refuses viewers unless allowViewer).
 */
export async function requireSaleStaff(
  authorizationHeader: string | null,
  opts: { write: boolean },
): Promise<RequireStaffResult> {
  const auth = await requireStaff(authorizationHeader, { allowViewer: !opts.write });
  if (!auth.ok || !opts.write || auth.role === "admin") return auth;
  const snap = await adminDb().collection("users").doc(auth.uid).get();
  if (snap.get("permissions.canManageTours") === true) return auth;
  return { ok: false, status: 403, error: "Tour management permission required" };
}
