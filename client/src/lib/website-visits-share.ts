import "server-only";

import { randomBytes, timingSafeEqual } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin-db";

/**
 * The private no-login link to the Website visits report, for the ad agency.
 * It shows visit counts only, never customer data. One link at a time, kept in
 * `reportShares/websiteVisits`; staff can replace it (the old link stops
 * working) or turn it off from Reports → Website visits.
 */

const DOC = () => adminDb().collection("reportShares").doc("websiteVisits");

export interface ShareState {
  enabled: boolean;
  token: string | null;
}

export async function getShare(): Promise<ShareState> {
  const snap = await DOC().get();
  const d = snap.data();
  const enabled = d?.enabled === true && typeof d.token === "string";
  return { enabled, token: enabled ? (d!.token as string) : null };
}

export async function createShare(uid: string): Promise<ShareState> {
  const token = randomBytes(24).toString("base64url");
  await DOC().set({
    token,
    enabled: true,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: uid,
  });
  return { enabled: true, token };
}

export async function disableShare(uid: string): Promise<void> {
  await DOC().set(
    { enabled: false, token: FieldValue.delete(), disabledAt: FieldValue.serverTimestamp(), disabledBy: uid },
    { merge: true },
  );
}

export async function isValidShareToken(token: string): Promise<boolean> {
  if (!token || token.length > 100) return false;
  const { enabled, token: current } = await getShare();
  if (!enabled || !current) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(current);
  return a.length === b.length && timingSafeEqual(a, b);
}
