import "server-only";

import type { DocumentSnapshot, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin-db";
import { ENQUIRY_STATUSES, type Enquiry, type EnquiryNote } from "@/types/enquiries";
import { cleanUtm } from "@/lib/utm";

export const ENQUIRIES_COL = "enquiries";

export function enquiriesCol() {
  return adminDb().collection(ENQUIRIES_COL);
}

function iso(v: unknown): string | null {
  if (v && typeof (v as Timestamp).toDate === "function") return (v as Timestamp).toDate().toISOString();
  return typeof v === "string" ? v : null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Firestore doc → JSON-safe Enquiry. */
export function serializeEnquiry(snap: DocumentSnapshot): Enquiry {
  const d = snap.data() ?? {};
  const notes: EnquiryNote[] = Array.isArray(d.notes)
    ? d.notes.map((n: Record<string, unknown>) => ({
        text: str(n.text),
        by: str(n.by),
        byName: str(n.byName),
        at: iso(n.at) ?? "",
      }))
    : [];
  return {
    id: snap.id,
    form: d.source?.form === "contact_us" ? "contact_us" : "tour_enquiry",
    status: ENQUIRY_STATUSES.includes(d.status) ? d.status : "new",
    name: str(d.name) || `${str(d.firstName)} ${str(d.lastName)}`.trim(),
    email: str(d.email),
    phone: str(d.phone),
    message: str(d.message),
    tour: d.tour && typeof d.tour === "object" ? { slug: d.tour.slug ?? null, name: d.tour.name ?? null } : null,
    subscribe: d.subscribe === true,
    location: d.source?.location ? str(d.source.location) : null,
    page: str(d.source?.page),
    utm: cleanUtm(d.source?.utm) as Record<string, string> | null,
    notes,
    test: typeof d.test === "boolean" ? d.test : null,
    teamEmail: d.emails?.team ? str(d.emails.team) : null,
    createdAt: iso(d.createdAt),
    updatedAt: iso(d.updatedAt),
  };
}
