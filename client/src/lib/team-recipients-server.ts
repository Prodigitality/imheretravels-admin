import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin-db";
import {
  DEFAULT_RECIPIENTS,
  TEAM_SETTINGS_DOC,
  enabledEmails,
  sanitizeRecipients,
  type TeamRecipient,
} from "@/lib/team-recipients";

const settingsRef = () => adminDb().collection(TEAM_SETTINGS_DOC.collection).doc(TEAM_SETTINGS_DOC.id);

/** The saved list, or the defaults when nobody has saved one yet. */
export async function getTeamRecipients(): Promise<TeamRecipient[]> {
  const snap = await settingsRef().get();
  return snap.exists ? sanitizeRecipients(snap.get("recipients")) : sanitizeRecipients(DEFAULT_RECIPIENTS);
}

/** Addresses for a team email. Never fails: on a read error, bella@ alone. */
export async function getTeamRecipientEmails(): Promise<string[]> {
  try {
    return enabledEmails(await getTeamRecipients());
  } catch (e) {
    console.error("[team-recipients] read failed, sending to bella@ only", e);
    return enabledEmails([]);
  }
}

export async function saveTeamRecipients(input: unknown, uid: string): Promise<TeamRecipient[]> {
  const recipients = sanitizeRecipients(input);
  await settingsRef().set({ recipients, updatedAt: FieldValue.serverTimestamp(), updatedBy: uid });
  return recipients;
}
