import "server-only";

import type { DocumentSnapshot, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin-db";
import {
  PARTNER_APPLICATION_STATUSES,
  PARTNER_APPLICATION_TYPES,
  type PartnerApplication,
  type PartnerApplicationNote,
} from "@/types/partner-applications";

export const PARTNER_APPLICATIONS_COL = "partnerApplications";

export function partnerApplicationsCol() {
  return adminDb().collection(PARTNER_APPLICATIONS_COL);
}

function iso(v: unknown): string | null {
  if (v && typeof (v as Timestamp).toDate === "function") return (v as Timestamp).toDate().toISOString();
  return typeof v === "string" ? v : null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Raw answer keys (www data/workWithUs.ts) shown as list highlights per type. */
const SUMMARY_KEYS: Record<string, string[]> = {
  host: ["describesYou", "following", "hostedBefore"],
  affiliate: ["contentType", "audienceSize"],
  supplier: ["serviceType", "groupCapacity"],
};

function answerText(v: unknown): string {
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string").join(", ");
  return typeof v === "string" ? v : "";
}

function summaryFor(type: string, data: Record<string, unknown> | undefined): { summary: string[]; destinations: string } {
  const d = data ?? {};
  const summary = (SUMMARY_KEYS[type] ?? [])
    .map((k) => {
      const v = answerText(d[k]);
      if (!v) return "";
      if (k === "hostedBefore") return v === "Yes" ? "Has hosted before" : "First-time host";
      if (k === "following" || k === "audienceSize") return `${v} followers`;
      return v;
    })
    .filter(Boolean);
  const destinations = answerText(type === "supplier" ? d.destinationsCovered : d.destinations);
  return { summary, destinations };
}

/** Firestore doc → JSON-safe PartnerApplication (never exposes the storage path). */
export function serializePartnerApplication(snap: DocumentSnapshot): PartnerApplication {
  const d = snap.data() ?? {};
  const type = PARTNER_APPLICATION_TYPES.includes(d.type) ? d.type : "host";
  const status = PARTNER_APPLICATION_STATUSES.includes(d.status) ? d.status : "new";
  const answerList = Array.isArray(d.answerList)
    ? d.answerList
        .filter((a: unknown) => a && typeof a === "object")
        .map((a: { label?: unknown; value?: unknown }) => ({ label: str(a.label), value: str(a.value) }))
    : [];
  const notes: PartnerApplicationNote[] = Array.isArray(d.notes)
    ? d.notes.map((n: Record<string, unknown>) => ({
        text: str(n.text),
        by: str(n.by),
        byName: str(n.byName),
        at: iso(n.at) ?? "",
      }))
    : [];
  return {
    id: snap.id,
    type,
    status,
    name: str(d.name),
    email: str(d.email),
    country: str(d.country),
    organisation: d.organisation ? str(d.organisation) : undefined,
    answerList,
    ...summaryFor(type, d.data),
    attachment: d.attachment
      ? { name: str(d.attachment.name), size: Number(d.attachment.size) || 0, contentType: str(d.attachment.contentType) }
      : null,
    notes,
    emails: d.emails ? { team: str(d.emails.team), applicant: str(d.emails.applicant) } : null,
    createdAt: iso(d.createdAt),
    updatedAt: iso(d.updatedAt),
    statusChangedBy: d.statusChangedBy ? str(d.statusChangedBy) : null,
  };
}

/** "First Last" (or email) of a staff user, for note attribution. */
export async function staffDisplayName(uid: string): Promise<string> {
  try {
    const d = (await adminDb().collection("users").doc(uid).get()).data();
    const first = d?.profile?.firstName ?? "";
    const last = d?.profile?.lastName ?? "";
    return `${first} ${last}`.trim() || d?.email || "Staff";
  } catch {
    return "Staff";
  }
}
